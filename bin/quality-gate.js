#!/usr/bin/env node
// quality-gate CLI entry point: the commands live in scripts/cli.js.
import { main } from "../scripts/cli.js";

process.exit(await main(process.argv.slice(2)));
