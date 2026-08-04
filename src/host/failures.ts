import { EmptyMarkError, InvalidSvgError } from '../pipeline/types.ts'

export class BundleWriteError extends Error {
  override readonly name = 'BundleWriteError'

  constructor(cause: unknown) {
    super('Manifesto could not write the icon files. Check the output folder and try again.', {
      cause,
    })
  }
}

export class BundleCollisionError extends Error {
  override readonly name = 'BundleCollisionError'

  constructor(files: string[]) {
    super(
      `The output folder already contains ${files.join(', ')}. ` +
        'Choose another folder or pass --force to replace them.',
    )
  }
}

export function describeFailure(error: unknown): string {
  if (error instanceof EmptyMarkError) {
    return (
      'This SVG has no visible artwork. Convert live text to outlines and export it again. ' +
      'Also check that the artwork is not hidden or fully transparent.'
    )
  }

  if (error instanceof InvalidSvgError) {
    // Do not expose parser or rendering library details to the user.
    return 'Manifesto could not read this SVG. Try exporting it again from your design tool.'
  }

  if (error instanceof BundleWriteError) {
    return error.message
  }

  if (error instanceof BundleCollisionError) {
    return error.message
  }

  return 'Manifesto could not generate the icons. Try another SVG or check the output folder.'
}

export function failureDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error)
  }
  const cause =
    error.cause instanceof Error ? `; cause: ${error.cause.name}: ${error.cause.message}` : ''
  return `${error.name}: ${error.message}${cause}`
}
