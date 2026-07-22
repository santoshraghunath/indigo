declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: string): string
}

interface ImportMeta {
  readonly url: string
}