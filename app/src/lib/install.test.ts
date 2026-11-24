import { expect, test } from 'vitest'
import { inAppBrowser, iphoneSafari } from './install'

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0'

test('iPhone Safari is told apart from Chrome and in-app browsers', () => {
  expect(iphoneSafari(SAFARI)).toBe(true)
  expect(iphoneSafari(CHROME_IOS)).toBe(false)
  expect(inAppBrowser(INSTAGRAM)).toBe(true)
  expect(inAppBrowser(SAFARI)).toBe(false)
})
