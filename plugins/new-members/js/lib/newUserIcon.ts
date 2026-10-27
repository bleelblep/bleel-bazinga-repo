/**
 * Discord's own NewUserIcon (design/components/Icon/native/redesign/generated, the 72px xxhdpi PNG
 * from the 352.2 APK) as `data:` URIs for the role icon slot.
 *
 * The slot only takes a URL or a unicode emoji and has no tint, so a colour has to be in the image
 * itself. The icon is one flat colour, so its alpha channel is all it takes: [tintedIconUrl] paints
 * that mask in any colour and writes it out as a PNG (uncompressed deflate, which every decoder
 * reads). Fresco loads data: URIs.
 */

const SIZE = 72

/** The PNG exactly as Discord ships it: near-white, made to be tinted. */
export const ORIGINAL_ICON_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAMAAABiM0N1AAAAPFBMVEVMaXHv7/Hv7/Hq6vPv7/Hv7/Hv7/Hu7vDv7/H////v7/Hv7/Hv7/Hv7/Hv7/Hv7/Hv7/Hv7/Ht7fPv7/FbrFSFAAAAE3RSTlMA6I0KRLNn+1YDwyOgM9D1fNsZH5YJ1AAAAlJJREFUWMPtWMe2nTAMxL3hBv//r+HSXRF592SRREsfGMuyNDMwDP/jLwlFsUPCRxbMtWgCi14gh6mC4lA3n6HptmbZteYoLB08JzGSYSBYJGsYkJRicxZumnS+xp6R8FxEjOUafqzPDIynOjkokFPfSWie7dsKtaJfJQ0H0l0gBAdCXSAPB/J/JiMHB3JdoBEONHaBOById4GMgOKIafhOI+mHWZNQIDl8Z2qd+hKP0B4zbrTHIDisX5z13BOgu9FxZVJWr0tDDyev3WW1E7cmC084YX+JLGQeSYqzNaLnEHo7hkOtAzVe96ekTgVRdQt+SJHZn2KmPqmf/UinwfV+lnBOkwhVNlsJi7AnnDt1oWZGx/kr5zprW8looLcaSdUTlLvolzUqbi1Zu1NHykHFreV9dITNNB/lmrj2kWp29hWpC9FTjVBlbdbKkeb+qmiNOCqzpkZfo3O785OzP/aTn6R8UC/fMlRyLmlSDRPunnQpsV2fMQ1swzGL54U73DiKwe54SESGeXEBsmgaXWFTWsygyKpNau6BZdtNtbHxKR/ZOqMmSVkEcG5TQ05vrS4blsekaccG0lkC6mHupmVD/J659UBT0pTqjdyVg0o38V3JaApLdmk95RBLNScPt1um9+zY2yWPZvbCWvHGtZOm5rOmpCBSm0f7wmTvuTbMjRQvgZqujb9CEh1fa984/+6nn2FQHGaePCTIIIO+2E24KBe5Q5fddeqIwZJy8PunTbaXP4uLMixhyW/q0Qn000DPH2ewwKD/BaB/JQhhNfzD8QvqIKpjyIy+oQAAAABJRU5ErkJggg=='

/** Alpha of each pixel, row by row. */
const MASK_B64 = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADRI3Q6Pv127N8IwAAAAAAAAAAAAAjfLPb9fvo0I1EAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETQ/////////////8NEAAAAAAAAM7P/////////////0EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjf//////////////////oAoAAAqN+/////////////////+NAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOz/////////////////////9AZGcP/////////////////////swMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI3////////////////////////b2////////////////////////40AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARP////////////////////////////////////////////////////9EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0P/////////////////////////////////////////////////////QAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABE////////////////////////////////////////////////////////MwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACN////////////////////////////////////////////////////////jQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADD////////////////////////////////////////////////////////wwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADo////////////////////////////////////////////////////////6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD1////////////////////////////////////////////////////////9QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADo////////////////////////////////////////////////////////6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQ////////////////////////////////////////////////////////0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACg////////////////////////////////////////////////////////oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABn////////////////////////////////////////////////////////ZwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAj+//////////////////////////////////////////////////////7GQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAw//////////////////////////////////////////////////////DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVv////////////////////////////////////////////////////9WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAND//////////////////////////////////////////////////9ADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAET//////////////////////////////////////////////////0QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADs/+zAwAAAACz////////////////////////////////////////////////swAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABW////VgAAAAAZ6P/////////////////////////////////////////////oGQAAAAAAAABWVgAAAAAAAAAAAAAAAAAAAADD////wwAAAAAARP////////////////////////////////////////////9WAAAAAAAAAFb//1YAAAAAAAAAAAAAAAAAAGf//////2cAAAAAAHz//////////////////////////////////////////3wAAAAAAAAACtv//9sKAAAAAAAAAAAAAAAAZ/v///////VnAAAAAACN////////////////////////////////////////oAAAAAAAAAADoP////+gAwAAAAAAAAAAA1bD////////////w0QAAAADs/////////////////////////////////////+zAwAAAAAAACOz////////syMAAAAAAAAAoP////////////////+gAAAACsP//////////////////////////////////8MKAAAAAAAAfPv///////////t8AAAAAAAA9f/////////////////1AAAAAAqz////////////////////////////////wwoAAAAAAAAA6P/////////////oAAAAAAAAoP////////////////+gAAAAAAADoP////////////////////////////+zCgAAAAAAAAAAfPv///////////t8AAAAAAAAAETD////////////w1YDAAAAAAAAAI3//////////////////////////40DAAAAAAAAAAAAACOz////////syMAAAAAAAAAAAAAZ/v///////VnAAAAAAAAAAAAAABn+//////////////////////7ZwAAAAAAAAAAAAAAAAADoP////+gAwAAAAAAAAAAAAAAAGf//////2cAAAAAAAAAAAAAAAAAM9v//////////////////+gzAAAAAAAAAAAAAAAAAAAACtv//9sDAAAAAAAAAAAAAAAAAADD////wwAAAAAAAAAAAAAAAAAAABnD////////////////wxkAAAAAAAAAAAAAAAAAAAAAAGf//1YAAAAAAAAAAAAAAAAAAABW////RAAAAAAAAAAAAAAAAAAAAAAAZ/X///////////t8AwAAAAAAAAAAAAAAAAAAAAAAAABWVgAAAAAAAAAAAAAAAAAAAAADoPWgAAAAAAAAAAAAAAAAAAAAAAAAADPQ////////0DMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADZ/X///V8AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjRFZnZ1ZEGQAAAAAAAAAAAAAAACN8fCMAAAAAAAAAAAAAAAAKM1ZnZ1ZEIwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAjZ42z2/v//////////9CNMwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjjdD7//////////vbs41nGQAAAAAAAAAAAAAAAAAAAFb7/////////////////////8NEAAAAAAAAAAAAAAAAAAAAAAAARMP/////////////////////+1YAAAAAAAAAAAAAAAAACvX/////////////////////////sxkAAAAAAAAAAAAAAAAAABmg//////////////////////////UKAAAAAAAAAAAAAAAAM////////////////////////////+hEAAAAAAAAAAAAAAAAM+j///////////////////////////8zAAAAAAAAAAAAAAAAGf/////////////////////////////7ZwAAAAAAAAAAAABW9f////////////////////////////8jAAAAAAAAAAAAAAAAANv/////////////////////////////+1YAAAAAAAAAAET1/////////////////////////////+gAAAAAAAAAAAAAAAAAAKD///////////////////////////////UzAAAAAAAAM/X//////////////////////////////6AAAAAAAAAAAAAAAAAAAFb////////////////////////////////bCgAAAAAD0P///////////////////////////////1YAAAAAAAAAAAAAAAAAAAr1////////////////////////////////fAAAAAB8////////////////////////////////9QoAAAAAAAAAAAAAAAAAAACN////////////////////////////////+yMAABn1////////////////////////////////oAAAAAAAAAAAAAAAAAAAAAAj9f///////////////////////////////6AAAKD////////////////////////////////7IwAAAAAAAAAAAAAAAAAAAAAAfP////////////////////////////////szM/v///////////////////////////////+NAAAAAAAAAAAAAAAAAAAAAAAACuj///////////////////////////////+zs////////////////////////////////+gKAAAAAAAAAAAAAAAAAAAAAAAAADP1////////////////////////////////////////////////////////////////+0QAAAAAAAAAAAAAAAAAAAAAAAAAAABW+///////////////////////////////////////////////////////////////VgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZ/v///////////////////////////////////////////////////////////tnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADPo////////////////////////////////////////////////////////6EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjs/////////////////////////////////////////////////////+zIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETD////////////////////////////////////////////////0EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI3zb+///////////6NCz////////s9Do////////////240zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACjNWZ2dWRCMKAAAA////////AAAACiNEVlZWVjMKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6P/////oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjf////+NAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA43o6I0DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function fromBase64(text: string): Uint8Array {
	const out = new Uint8Array(Math.floor((text.replace(/=+$/, '').length * 3) / 4))
	let bits = 0
	let value = 0
	let o = 0
	for (const c of text) {
		const i = B64.indexOf(c)
		if (i < 0) continue
		value = (value << 6) | i
		bits += 6
		if (bits >= 8) {
			bits -= 8
			out[o++] = (value >> bits) & 0xff
		}
	}
	return out
}

function toBase64(bytes: Uint8Array): string {
	let out = ''
	for (let i = 0; i < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
		out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
		out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
		out += i + 2 < bytes.length ? B64[n & 63] : '='
	}
	return out
}

let crcTable: Uint32Array | undefined

function crc32(bytes: Uint8Array, start: number, end: number): number {
	if (!crcTable) {
		crcTable = new Uint32Array(256)
		for (let n = 0; n < 256; n++) {
			let c = n
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
			crcTable[n] = c >>> 0
		}
	}
	let crc = 0xffffffff
	for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length)
	const view = new DataView(out.buffer)
	view.setUint32(0, data.length)
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
	out.set(data, 8)
	view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length))
	return out
}

/** A zlib stream of one stored (uncompressed) block; fine up to 65535 bytes. */
function zlibStored(raw: Uint8Array): Uint8Array {
	const out = new Uint8Array(raw.length + 11)
	out[0] = 0x78
	out[1] = 0x01
	out[2] = 1 // final block, stored
	out[3] = raw.length & 0xff
	out[4] = raw.length >> 8
	out[5] = ~raw.length & 0xff
	out[6] = (~raw.length >> 8) & 0xff
	out.set(raw, 7)
	let a = 1
	let b = 0
	for (const byte of raw) {
		a = (a + byte) % 65521
		b = (b + a) % 65521
	}
	new DataView(out.buffer).setUint32(raw.length + 7, ((b << 16) | a) >>> 0)
	return out
}

const cache = new Map<string, string>()

/** The icon painted in [hex] (`#rrggbb`). */
export function tintedIconUrl(hex: string): string {
	const cached = cache.get(hex)
	if (cached) return cached

	const n = Number.parseInt(hex.replace('#', ''), 16)
	const r = (n >> 16) & 0xff
	const g = (n >> 8) & 0xff
	const bl = n & 0xff
	const mask = fromBase64(MASK_B64)

	// Each row: filter byte 0, then RGBA per pixel.
	const raw = new Uint8Array(SIZE * (1 + SIZE * 4))
	for (let y = 0; y < SIZE; y++) {
		let o = y * (1 + SIZE * 4) + 1
		for (let x = 0; x < SIZE; x++) {
			raw[o++] = r
			raw[o++] = g
			raw[o++] = bl
			raw[o++] = mask[y * SIZE + x]
		}
	}

	const header = new Uint8Array(13)
	const hv = new DataView(header.buffer)
	hv.setUint32(0, SIZE)
	hv.setUint32(4, SIZE)
	header[8] = 8 // bit depth
	header[9] = 6 // RGBA

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk('IHDR', header),
		pngChunk('IDAT', zlibStored(raw)),
		pngChunk('IEND', new Uint8Array(0)),
	]
	const png = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
	let offset = 0
	for (const part of parts) {
		png.set(part, offset)
		offset += part.length
	}

	const url = `data:image/png;base64,${toBase64(png)}`
	cache.set(hex, url)
	return url
}
