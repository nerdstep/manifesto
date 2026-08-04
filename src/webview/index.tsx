import { render } from 'preact'

import { App } from './App.tsx'

const host = document.getElementById('root')
if (host === null) throw new Error('#root is missing from index.html')

render(<App />, host)
