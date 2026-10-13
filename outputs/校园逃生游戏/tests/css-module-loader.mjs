// DOM styles are separately checked by the browser; SSR tests import only the UI module.
export async function load(url,context,nextLoad){if(new URL(url).pathname.endsWith('.css'))return {format:'module',source:'export {};',shortCircuit:true};return nextLoad(url,context);}
