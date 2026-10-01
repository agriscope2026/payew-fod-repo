import { describe, expect, it } from 'vitest'
import { jpegName, squareCrop } from './image'

describe('squareCrop', () => {
  it('centres the square on landscape and portrait images', () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000 })
    expect(squareCrop(1080, 1920)).toEqual({ sx: 0, sy: 420, side: 1080 })
    expect(squareCrop(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 })
  })
})

describe('jpegName', () => {
  it('swaps the extension for .jpg', () => {
    expect(jpegName('My Photo.WEBP')).toBe('My Photo.jpg')
    expect(jpegName('IMG_0001.jpeg')).toBe('IMG_0001.jpg')
    expect(jpegName('scan.v2.png')).toBe('scan.v2.jpg')
    expect(jpegName('noext')).toBe('noext.jpg')
    expect(jpegName('.png')).toBe('photo.jpg')
  })
})
