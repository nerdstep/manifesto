/** Generic launcher squircle, used only by the Android mask preview. */
export const SQUIRCLE_PATH =
  'M.5,0 C.1,0 0,.1 0,.5 C0,.9 .1,1 .5,1 C.9,1 1,.9 1,.5 C1,.1 .9,0 .5,0 Z'

/**
 * Apple-like outline, visually fitted to developer.apple.com/design/resources/.
 * Mirrored cubic segments join flat sides with zero curvature at each junction.
 * Contains the 10%-inset square; the mark needs no clipping or extra padding.
 */
export const ROUNDED_ICON_PATH =
  'M.32,0 H.68 C.762,0 .854,0 .927,.073 C1,.146 1,.238 1,.32 ' +
  'V.68 C1,.762 1,.854 .927,.927 C.854,1 .762,1 .68,1 ' +
  'H.32 C.238,1 .146,1 .073,.927 C0,.854 0,.762 0,.68 ' +
  'V.32 C0,.238 0,.146 .073,.073 C.146,0 .238,0 .32,0 Z'
