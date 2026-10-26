// Load the UI dynamically so module loading errors are visible instead of a blank page.
import('./main').catch((reason:unknown)=>{
  const error = String(reason instanceof Error ? reason.stack || reason.message : reason);
  const report = (window as Window & {__hdrStartupError?: (message:string)=>void}).__hdrStartupError;
  if(report) report('Application module failed to load:\n'+error);
  else document.body.textContent = 'HDR Bracket Studio startup error: '+error;
});
