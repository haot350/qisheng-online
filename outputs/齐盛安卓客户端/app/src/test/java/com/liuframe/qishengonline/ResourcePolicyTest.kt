package com.liuframe.qishengonline

import org.junit.Assert.*
import org.junit.Test

class ResourcePolicyTest {
    @Test fun singleRangesRetainExactByteBounds() {
        assertEquals(ByteRange(0, 99, false), ByteRange.parse(null, 100))
        assertEquals(ByteRange(10, 19, true), ByteRange.parse("bytes=10-19", 100))
        assertEquals(ByteRange(90, 99, true), ByteRange.parse("bytes=90-", 100))
        assertEquals(ByteRange(90, 99, true), ByteRange.parse("bytes=-10", 100))
        assertEquals(ByteRange(0, 99, true), ByteRange.parse("bytes=0-999", 100))
        for (value in listOf("bytes=100-", "bytes=20-10", "bytes=-0", "bytes=0-2,4-6", "bytes=99999999999999999999999-")) {
            assertThrows(IllegalArgumentException::class.java) { ByteRange.parse(value, 100) }
        }
    }
    @Test fun manifestPathsNeverEscapeThePack() {
        assertEquals("/assets/a+b.glb", ResourcePolicy.canonicalPath("/assets/a+b.glb"))
        assertEquals("/账号.json", ResourcePolicy.canonicalPath("/%E8%B4%A6%E5%8F%B7.json"))
        for (value in listOf("//other/file", "/../private", "/%2e%2e/private", "/a%2fb", "/a%5Cb", "/a%00b", "/a\\b")) assertNull(ResourcePolicy.canonicalPath(value))
        assertTrue(ResourcePolicy.onlineOnly("/api/v1/accounts/me"))
        assertTrue(ResourcePolicy.onlineOnly("/realtime/w1/"))
        assertFalse(ResourcePolicy.onlineOnly("/assets/map/a.glb"))
    }
    @Test fun binaryMimeAndFilenamesStayUnambiguous() {
        assertEquals("application/wasm", ResourcePolicy.mime("/assets/a.wasm"))
        assertEquals("model/gltf-binary", ResourcePolicy.mime("/map/a.glb"))
        assertEquals("application/octet-stream", ResourcePolicy.mime("/map/a.gz"))
        assertEquals("photo.jpg", ResourcePolicy.exportFilename("../../photo.jpg"))
    }
}
