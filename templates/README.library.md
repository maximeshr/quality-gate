<!--
OKQ README template: published library.
Follows Standard Readme (https://github.com/RichardLitt/standard-readme): keep the section order,
drop optional sections you do not need, keep the required ones (marked "required").
Write in American English. Replace every <placeholder>, then delete this comment.
-->

# <package-name>

[![CI](https://github.com/maximeshr/<repo>/actions/workflows/ci.yml/badge.svg?branch=canary)](https://github.com/maximeshr/<repo>/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/<package-name>)](https://www.npmjs.com/package/<package-name>)

<!-- Short description (required): one sentence, what it does and for whom. -->

<One sentence: what the library does and for whom.>

<!-- Long description (optional): the problem, why this library, what it does not do. -->

<Two or three short paragraphs: the problem it solves, how, and its limits.>

<!-- Table of contents (required when the README is 100 lines or longer). -->

## Table of contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Compatibility](#compatibility)
- [Contributing](#contributing)
- [License](#license)

## Install

```sh
npm install <package-name>
```

<!-- Dependencies: required if something must be installed by hand. -->

## Usage

```ts
import { <main export> } from "<package-name>";

<the smallest useful example>
```

<!-- One subsection per common use case, each with a runnable example. -->

## API

<!-- Every public export: signature, parameters, return value, errors. -->

### `<export>(<parameters>)`

<What it does.> Returns <type>.

## Compatibility

- Node.js `<engines.node>` (ESM only; CommonJS consumers load it with `import()`).
- TypeScript types are included.

## Contributing

Pull requests target `canary`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Maxime Sahroui
