/**
 * Webview entry point.
 *
 * Kept tiny on purpose. The drop guards and the error reporter already ran inline in
 * index.html — see the comment there for why they cannot live in this bundle.
 *
 * Note the shape of the boot: an async IIFE, never top-level await. Electrobun serves
 * this with a plain `<script src>`, so it is a classic script and top-level await is a
 * syntax error that takes the whole module down.
 */

import { render } from 'preact'

import { App } from './App.tsx'

const host = document.getElementById('root')
if (host === null) throw new Error('#root is missing from index.html')

render(<App />, host)
