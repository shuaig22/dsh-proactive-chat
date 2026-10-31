export function normalizeOneBotEndpoint(value) {
  return String(value ?? '').trim().replace(/\/+$/, '').toLowerCase()
}

export function inspectIdentityCompatibility(identityConfig = {}, onebotUrl = '') {
  const source = identityConfig && typeof identityConfig === 'object' ? identityConfig : {}
  const identityUrl = source.transport?.onebot?.url
  const sameTransport = (
    String(source.transport?.mode ?? '') === 'onebot'
    && Boolean(identityUrl)
    && normalizeOneBotEndpoint(identityUrl) === normalizeOneBotEndpoint(onebotUrl)
  )
  const companionEnabled = sameTransport && source.companion?.enabled === true

  return {
    detected: Boolean(source.transport || source.companion),
    sameTransport,
    companionEnabled,
    allowReply: !sameTransport,
    allowProactive: !companionEnabled,
    reason: companionEnabled
      ? 'identity-companion'
      : sameTransport
        ? 'identity-replies'
        : 'standalone',
  }
}
