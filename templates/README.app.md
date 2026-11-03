<!--
OKQ README template: application or website (deployed, not published on npm).
Follows Standard Readme (https://github.com/RichardLitt/standard-readme): keep the section order,
drop optional sections you do not need, keep the required ones (marked "required").
"Install" and "Usage" are about working on the project: install the tooling, run it locally.
Write in American English. Replace every <placeholder>, then delete this comment.
-->

# <project-name>

[![CI](https://github.com/maximeshr/<repo>/actions/workflows/ci.yml/badge.svg?branch=canary)](https://github.com/maximeshr/<repo>/actions/workflows/ci.yml)

<!-- Short description (required): one sentence, what the app is and where it runs. -->

<One sentence: what the app is, and its production URL.>

## Table of contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Background

<!-- Optional: why the project exists, the stack in one table. -->

| Area      | Choice                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Framework | <framework>                                                                   |
| Tooling   | Vite+ (`vp`), pnpm, [quality-gate](https://github.com/maximeshr/quality-gate) |
| Hosting   | <host>                                                                        |

## Install

Install [Vite+](https://viteplus.dev) once (`curl -fsSL https://vite.plus | bash`): it downloads the pnpm and Node.js versions pinned in `package.json` `devEngines`.

```sh
vp install        # dependencies and git hooks
```

## Usage

```sh
vp dev            # local server
vp check          # format, lint, types
vp test           # tests
vp run build      # production build
```

<!-- Extra sections (optional): project structure, content authoring, anything a contributor needs. -->

## Deployment

<!-- Where each branch deploys: canary (preview), main (production). -->

| Branch   | Environment      |
| -------- | ---------------- |
| `canary` | <preview URL>    |
| `main`   | <production URL> |

## Contributing

Pull requests target `canary`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

<!-- Pick one: an open source license with a LICENSE file, or "All rights reserved" for a private project. -->

© Maxime Sahroui. All rights reserved.
