package com.liuframe.qishengonline

import android.app.ActivityManager
import android.content.Context
import android.os.PowerManager
import org.json.JSONObject

/** Coarse workload hints only; no persistent device or GPU identity. */
class PerformanceSignals(context: Context, private val changed: () -> Unit) {
    private val power=context.getSystemService(PowerManager::class.java)
    private val memory=context.getSystemService(ActivityManager::class.java)
    private var pressure=false
    private val listener=PowerManager.OnThermalStatusChangedListener { changed() }
    init { power.addThermalStatusListener(context.mainExecutor,listener) }
    fun trim(){pressure=true;changed()}
    fun resumed(){pressure=false;changed()}
    fun snapshot(): JSONObject = JSONObject().put("thermalStatus",power.currentThermalStatus.coerceIn(0,6))
        .put("powerSave",power.isPowerSaveMode).put("lowMemory",pressure||memory.isLowRamDevice)
    fun close(){power.removeThermalStatusListener(listener)}
}
