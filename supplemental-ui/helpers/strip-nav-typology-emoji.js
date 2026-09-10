'use strict'

const LEADING_EMOJI_RE =
  /^[\s\uFE0F\u200D]*(?:🎓|🛠️?|📚|🧠|📋|🧩|✨|📦)[\s\uFE0F\u200D]*/u

module.exports = (text) => {
  if (text == null || text === '') return text
  let out = String(text)
  let prev
  do {
    prev = out
    out = out.replace(LEADING_EMOJI_RE, '')
  } while (out !== prev)
  return out.trimStart()
}
