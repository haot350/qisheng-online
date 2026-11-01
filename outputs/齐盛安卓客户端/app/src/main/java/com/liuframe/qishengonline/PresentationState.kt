package com.liuframe.qishengonline

data class PresentationState(val inSession:Boolean,val playing:Boolean,val orientation:String) {
    init { require(orientation == "auto" || orientation == "landscape"); require(!playing || inSession) }
    fun keepAwake(visible:Boolean)=playing && visible
    fun mayOfferUpdate(visible:Boolean)=visible && !inSession
}
