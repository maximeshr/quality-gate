/**
 * Comment rules no published plugin covers, inspired by the pstack comment-sicko agent.
 * Loaded by the base config as the `comments` Oxlint JS plugin
 */

import { definePlugin, defineRule } from "@oxlint/plugins";

const SUPPRESSION = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/u;
const JUSTIFICATION = /\s--\s*\S.{4,}/u;

const DIRECTIVE =
  /^\s*(?:@ts-|@(?:type|typedef|satisfies|license|preserve|jsx|vite-ignore)\b|#__|(?:eslint|oxlint|biome)-|prettier-ignore|(?:istanbul|c8|v8)\s+ignore|SPDX-|\/\s*<reference)/u;

const BLOCK_DIRECTIVE = /^\s*(?:globals?|exported)\s/u;

const LICENSE = /\b(?:copyright|licen[cs]e|spdx)\b|©|\(c\)/iu;
const SAFETY = /^\s*SAFETY:\s*\S/u;
const EXTERNAL = /^[\s*]*EXTERNAL:\s*\S.*\bhttps:\/\/\S/su;

const TYPE_TAG =
  /@(?:type|typedef|callback|template|satisfies|enum|this|overload)\b|@(?:param|arg|argument|returns?|prop|property|throws)\s*\{/u;

const JAVASCRIPT_FILE = /\.[cm]?jsx?$/u;
const BLANK_LINE = /\n[^\S\n]*\n/u;

const WORD = /[\p{L}\d]+/gu;
const IDENTIFIER_PART = /\p{Lu}?\p{Ll}+|\p{Lu}+(?!\p{Ll})|\d+/gu;
const MAX_RESTATING_WORDS = 8;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "so",
  "the",
  "then",
  "this",
  "to",
  "with",
]);

/**
 * @param {string} word a lowercase word
 * @returns {string} the word without its plural or verb ending
 */
const stem = (word) => word.replace(/(?:ing|ed|es|s)$/u, "") || word;

/**
 * @param {string} code a line of code
 * @returns {Set<string>} the stems of its keywords and identifier parts
 */
const codeWords = (code) => {
  /** @type {Set<string>} */
  const words = new Set();

  for (const [token] of code.matchAll(WORD)) {
    for (const [part] of token.matchAll(IDENTIFIER_PART)) {
      words.add(stem(part.toLowerCase()));
    }
  }

  return words;
};

/**
 * @param {string} text comment text
 * @returns {string[]} its lowercase words
 */
const proseWords = (text) => [...text.toLowerCase().matchAll(WORD)].map(([word]) => word);

/**
 * @param {string[]} lines source lines
 * @param {number} index first line to look at
 * @returns {string} the first line that is neither blank nor a line comment
 */
const nextCodeLine = (lines, index) =>
  lines
    .slice(index)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("//")) ?? "";

/**
 * @param {import("@oxlint/plugins").Comment} comment a comment
 * @returns {boolean} true for an instruction to a tool: lint, TypeScript, bundler or coverage
 */
const isDirective = (comment) =>
  DIRECTIVE.test(comment.value) ||
  (comment.type === "Block" && BLOCK_DIRECTIVE.test(comment.value));

/**
 * @param {import("@oxlint/plugins").Comment} comment a comment
 * @returns {boolean} true for a `/** *\/` block
 */
const isJsdoc = (comment) => comment.type === "Block" && comment.value.startsWith("*");

/**
 * @param {string} text source text
 * @param {number} end offset where a comment ends
 * @returns {{ next: number, adjacent: boolean }} the offset of the next code, and whether no
 *   blank line separates it from the comment
 */
const followingCode = (text, end) => {
  const gap = text.slice(end).search(/\S/u);
  const next = gap === -1 ? text.length : end + gap;

  return { adjacent: !BLANK_LINE.test(text.slice(end, next)), next };
};

/**
 * @param {import("@oxlint/plugins").ESTree.TSAsExpression | import("@oxlint/plugins").ESTree.TSTypeAssertion} node an assertion
 * @returns {boolean} true for `as const`
 */
const isConstAssertion = ({ typeAnnotation }) =>
  typeAnnotation.type === "TSTypeReference" &&
  typeAnnotation.typeName.type === "Identifier" &&
  typeAnnotation.typeName.name === "const";

const STATEMENT_CONTAINERS = new Set([
  "BlockStatement",
  "Program",
  "StaticBlock",
  "SwitchCase",
  "TSModuleBlock",
]);

export const noComments = defineRule({
  create(context) {
    const { text } = context.sourceCode;
    const javascript = JAVASCRIPT_FILE.test(context.filename);
    /** @type {Set<number>} */
    const documented = new Set();
    /** @type {Set<number>} */
    const asserted = new Set();

    /**
     * @template {import("@oxlint/plugins").ESTree.Node} T
     * @param {(node: T) => { start: number }[]} targets the declarations or members a JSDoc may document
     * @returns {(node: T) => void} a visitor recording where they start
     */
    const documenting = (targets) => (node) => {
      for (const target of targets(node)) {
        documented.add(target.start);
      }
    };

    /** @param {import("@oxlint/plugins").ESTree.TSAsExpression | import("@oxlint/plugins").ESTree.TSTypeAssertion} node an assertion */
    const assertion = (node) => {
      if (isConstAssertion(node)) {
        return;
      }

      /** @type {import("@oxlint/plugins").ESTree.Node} */
      let current = node;

      while (current.type !== "Program") {
        asserted.add(current.start);

        if (STATEMENT_CONTAINERS.has(current.parent.type)) {
          return;
        }

        current = current.parent;
      }
    };

    /**
     * @param {import("@oxlint/plugins").Comment} comment a comment
     * @param {number} index its position among the comments of the file
     * @returns {boolean} true for a comment the delete-comments skill keeps as a contract
     */
    const isContract = (comment, index) => {
      const { next, adjacent } = followingCode(text, comment.end);

      return (
        isDirective(comment) ||
        (index === 0 &&
          LICENSE.test(comment.value) &&
          /^(?:#![^\n]*)?\s*$/u.test(text.slice(0, comment.start))) ||
        (isJsdoc(comment) &&
          ((adjacent && documented.has(next)) || (javascript && TYPE_TAG.test(comment.value)))) ||
        (SAFETY.test(comment.value) && adjacent && asserted.has(next)) ||
        EXTERNAL.test(comment.value)
      );
    };

    return {
      ClassBody: documenting((node) => node.body.filter((member) => member.type !== "StaticBlock")),
      ExportDefaultDeclaration: documenting((node) => [node]),
      ExportNamedDeclaration: documenting((node) => [node]),
      "Program:exit"() {
        const comments = context.sourceCode
          .getAllComments()
          .filter((comment) => comment.type !== "Shebang");

        for (const [index, comment] of comments.entries()) {
          if (!isContract(comment, index)) {
            context.report({ loc: comment.loc, messageId: "comment" });
          }
        }
      },
      TSAsExpression: assertion,
      TSEnumBody: documenting((node) => node.members),
      TSInterfaceBody: documenting((node) => node.body),
      TSTypeAssertion: assertion,
      TSTypeLiteral: documenting((node) => node.members),
    };
  },
  meta: {
    docs: {
      description:
        "Disallow every comment except the contracts of the delete-comments skill: license header, JSDoc on exports and members, SAFETY before an assertion, EXTERNAL with a link, tool directives",
    },
    messages: {
      comment:
        "Delete this comment: say it with a name, a type or an extraction, or move it into an ADR or an issue. Only contracts stay (license header, JSDoc on an export or a member, `SAFETY:` before an assertion, `EXTERNAL: <why> https://…`, tool directives).",
    },
    schema: [],
    type: "suggestion",
  },
});

export const requireSuppressionReason = defineRule({
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (SUPPRESSION.test(comment.value) && !JUSTIFICATION.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: "missing" });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description: "Require a `-- reason` on every eslint-disable and oxlint-disable directive",
    },
    messages: {
      missing:
        "Explain why this rule is disabled after ` -- `, or fix the code instead of silencing the rule.",
    },
    schema: [],
    type: "suggestion",
  },
});

export const noRestatingComment = defineRule({
  create(context) {
    const { lines } = context.sourceCode;

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const oneLine = comment.loc.start.line === comment.loc.end.line;

          if (!oneLine || isDirective(comment) || comment.value.includes("@")) {
            continue;
          }

          const words = proseWords(comment.value.replace(/^\*/u, "")).filter(
            (word) => !STOP_WORDS.has(word),
          );

          if (words.length === 0 || words.length > MAX_RESTATING_WORDS) {
            continue;
          }

          const line = lines[comment.loc.start.line - 1] ?? "";
          const before = line.slice(0, comment.loc.start.column).trim();
          const above = lines[comment.loc.start.line - 2]?.trim() ?? "";
          const below = lines[comment.loc.end.line]?.trim() ?? "";

          if (before === "" && (above.startsWith("//") || below.startsWith("//"))) {
            continue;
          }

          const code = before === "" ? nextCodeLine(lines, comment.loc.end.line) : before;
          const vocabulary = codeWords(code);

          if (code !== "" && words.every((word) => vocabulary.has(stem(word)))) {
            context.report({ loc: comment.loc, messageId: "restating" });
          }
        }
      },
    };
  },
  meta: {
    docs: {
      description: "Disallow a one-line comment whose words all appear in the code it describes",
    },
    messages: {
      restating:
        "This comment restates the code. Delete it, or say why the code is written this way.",
    },
    schema: [],
    type: "suggestion",
  },
});

export default definePlugin({
  meta: { name: "comments" },
  rules: {
    "no-comments": noComments,
    "no-restating-comment": noRestatingComment,
    "require-suppression-reason": requireSuppressionReason,
  },
});
