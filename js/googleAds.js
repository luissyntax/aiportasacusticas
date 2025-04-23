function gtag_report_conversion(url) {
  var callback = function () {
    if (typeof(url) != 'undefined') {

      window.location = url;
    }
  };
  gtag('event', 'conversion', {
      'send_to': 'AW-17022240399/hlxDCIKl57waEI-N67Q_',
      'value': 1.0,
      'currency': 'BRL',
      'event_callback': callback
  });
  return false;
}
