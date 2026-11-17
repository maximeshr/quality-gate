/**
 * Comment rules no published plugin covers, inspired by the pstack comment-sicko agent.
 * Loaded by the base config as the `comments` Oxlint JS plugin
 */

import { definePlugin, defineRule } from "@oxlint/plugins";

const SUPPRESSION = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b/u;
const JUSTIFICATION = /\s--\s*\S.{4,}/u;

const DIRECTIVE =
  /^\s*(?:@ts-|@(?:type|typedef|satisfies|license|preserve|jsx|vite-ignore)\b|#__|(?:eslint|oxlint|biome)-|globals?\s|prettier-ignore|(?:istanbul|c8|v8)\s+ignore|SPDX-|\/\s*<reference)/u;

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

          if (!oneLine || DIRECTIVE.test(comment.value) || comment.value.includes("@")) {
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
    "no-restating-comment": noRestatingComment,
    "require-suppression-reason": requireSuppressionReason,
  },
});
