package com.liuframe.qishengonline

data class NativeUpdate(val productId:String,val applicationId:String,val version:String,val versionCode:Int,val downloadUrl:String,val bytes:Long,val sha256:String,val notes:List<String>)
object UpdatePolicy {
    fun accepted(value:NativeUpdate,currentCode:Int):Boolean =
        value.productId=="qisheng-online-android" && value.applicationId=="com.liuframe.qishengonline" &&
        value.versionCode>currentCode && Regex("^\\d+\\.\\d+\\.\\d+$").matches(value.version) &&
        Regex("^[a-f0-9]{64}$").matches(value.sha256) && value.bytes>0 &&
        Regex("^/native/releases/"+value.sha256+"/[A-Za-z0-9._-]+\\.apk$").matches(value.downloadUrl) &&
        value.notes.size<=8 && value.notes.all { it.length<=240 }
}
