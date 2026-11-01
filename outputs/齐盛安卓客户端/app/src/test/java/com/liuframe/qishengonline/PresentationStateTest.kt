package com.liuframe.qishengonline

import org.junit.Assert.*
import org.junit.Test

class PresentationStateTest {
    @Test fun aPortraitRoomStillDefersUpdatesWithoutKeepingTheScreenAwake() {
        val room=PresentationState(true,false,"auto")
        assertFalse(room.mayOfferUpdate(true));assertFalse(room.keepAwake(true))
        val match=PresentationState(true,true,"landscape")
        assertTrue(match.keepAwake(true));assertFalse(match.keepAwake(false))
        assertTrue(PresentationState(false,false,"auto").mayOfferUpdate(true))
        assertThrows(IllegalArgumentException::class.java){PresentationState(false,true,"landscape")}
    }
}
