package com.liuframe.qishengonline
import org.junit.Assert.*
import org.junit.Test

class UpdatePolicyTest {
    @Test fun updatesMatchThisProductAndRequireAConfirmationEligibleNewApk() {
        val sha="a".repeat(64)
        val valid=NativeUpdate("qisheng-online-android","com.liuframe.qishengonline","0.1.1",2,"/native/releases/$sha/game.apk",1234,sha,listOf("修复连接问题"))
        assertTrue(UpdatePolicy.accepted(valid,1))
        assertFalse(UpdatePolicy.accepted(valid,2))
        assertFalse(UpdatePolicy.accepted(valid.copy(productId="retired-godot"),1))
        assertFalse(UpdatePolicy.accepted(valid.copy(applicationId="another.app"),1))
        assertFalse(UpdatePolicy.accepted(valid.copy(downloadUrl="https://other.invalid/game.apk"),1))
        assertFalse(UpdatePolicy.accepted(valid.copy(downloadUrl="/native/releases/$sha/game.zip"),1))
        assertFalse(UpdatePolicy.accepted(valid.copy(sha256="b".repeat(64)),1))
    }
}
