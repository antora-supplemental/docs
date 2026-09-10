'use strict'

const { resolveTypologyId: resolveTypologyIdCore } = require('@antora-supplemental/nav-typology/lib/resolve-typology')

const TYPOLOGIES = {
  'component-root': { id: 'component-root', spriteId: 'icon-component-root', label: 'Component' },
  'spec-component': { id: 'spec-component', spriteId: 'icon-spec-component', label: 'Component spec' },
  'spec-feature': { id: 'spec-feature', spriteId: 'icon-spec-feature', label: 'Feature spec' },
  'diataxis-tutorial': { id: 'diataxis-tutorial', spriteId: 'icon-diataxis-tutorial', label: 'Tutorial' },
  'diataxis-howto': { id: 'diataxis-howto', spriteId: 'icon-diataxis-howto', label: 'How-to' },
  'diataxis-reference': { id: 'diataxis-reference', spriteId: 'icon-diataxis-reference', label: 'Reference' },
  'diataxis-explanation': {
    id: 'diataxis-explanation',
    spriteId: 'icon-diataxis-explanation',
    label: 'Explanation',
  },
  changelog: {
    id: 'changelog',
    spriteId: 'icon-changelog',
    label: 'Changelog',
  },
}

function diataxisEnabled ({ data } = {}) {
  const keys = (data && data.root && data.root.site && data.root.site.keys) || {}
  return keys.nav_typology_diataxis === 'true' || keys.nav_typology === 'true'
}

function resolveTypology (item, options = {}) {
  if (!item || typeof item !== 'object') return null

  const level = options.hash?.level ?? 0
  const depth = Number(level) || 0
  const parentTypologyId = options.hash?.parentTypologyId || ''
  const diataxis = diataxisEnabled(options)

  let id = null
  if (depth === 0 && item.url && Array.isArray(item.items) && item.items.length) {
    id = 'component-root'
  } else {
    id = resolveTypologyIdCore(item, {
      depth,
      parentTypologyId,
      diataxisEnabled: diataxis,
      skipBuildFallback: false,
    })
  }

  return id && TYPOLOGIES[id] ? TYPOLOGIES[id] : null
}

module.exports = (item, options = {}) => {
  const meta = resolveTypology(item, options)
  return meta ? meta.id : ''
}
