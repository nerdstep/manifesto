import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PIPELINE_DIR = join(import.meta.dir, '..', 'src', 'pipeline')

const FORBIDDEN = [
  { pattern: /["']node:fs["']/u, why: 'filesystem access' },
  { pattern: /["']node:fs\/promises["']/u, why: 'filesystem access' },
  { pattern: /["']fs["']/u, why: 'filesystem access' },
  { pattern: /["']node:path["']/u, why: 'path resolution implies filesystem' },
  { pattern: /["']electrobun/u, why: 'shell dependency' },
  { pattern: /["']\.\.\/bun\//u, why: 'shell dependency' },
  { pattern: /["']\.\.\/webview\//u, why: 'UI dependency' },
]

function pipelineFiles(): string[] {
  return readdirSync(PIPELINE_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(PIPELINE_DIR, f))
}

/** Strip comments so documentation mentioning `node:fs` doesn't trip the guard. */
function code(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/.*$/gmu, '')
}

describe('pipeline purity', () => {
  const files = pipelineFiles()

  test('finds the pipeline sources', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const name = file.slice(PIPELINE_DIR.length + 1)

    test(`${name} has no forbidden imports`, () => {
      const source = code(readFileSync(file, 'utf8'))
      const importLines = source
        .split('\n')
        .filter((l) => /^\s*(import|export)\b.*\bfrom\b|require\(/u.test(l))

      for (const line of importLines) {
        for (const { pattern, why } of FORBIDDEN) {
          expect(
            pattern.test(line),
            `${name} imports something it must not (${why}):\n    ${line.trim()}`,
          ).toBe(false)
        }
      }
    })
  }

  test('the pipeline is importable without any host environment', async () => {
    const mod = await import('../src/pipeline/index.ts')
    expect(typeof mod.createPipeline).toBe('function')
  })

  test('nothing that rasterizes is reachable without createPipeline', async () => {
    // Rasterizing functions must remain behind the asynchronous factory.
    const mod: Record<string, unknown> = await import('../src/pipeline/index.ts')

    for (const name of [
      'buildBundle',
      'normalize',
      'measureMark',
      'rasterize',
      'rasterizeToPixels',
      'pixelDriftPercent',
      'initRasterizer',
      'isRasterizerReady',
    ]) {
      expect(mod[name], `${name} must not be exported from the barrel`).toBeUndefined()
    }
  })
})
