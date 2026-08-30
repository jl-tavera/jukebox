#!/usr/bin/env bun
import { processIo } from './io'
import { main } from './main'

/**
 * The whole of the binary. Everything that decides anything is in `main`.
 *
 * The code is set rather than exited with, because `process.exit` can cut a
 * write to a pipe short on the way out -- and the one thing a caller reading
 * this in JSON mode cannot survive is half an object.
 */
process.exitCode = await main(process.argv.slice(2), processIo())
