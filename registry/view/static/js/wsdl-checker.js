$(function(){
  var $success = $("#wsdl_check_success");
  var $fail = $("#wsdl_check_fail");
  var $loading = $("#wsdl_check_loading");
  $loading.show();

  function wfButtons() {
    var dfd = jQuery.Deferred();
    $('.workflow.panel-workflow').bind("DOMNodeInserted",function(e){
      var $buttons = $(this).find('.btn-group > button');
      $buttons.attr("disabled", "disabled");
      dfd.resolve($buttons);
    });
    return dfd.promise();
  };

  function wsdlChecker() {
    var dfd = jQuery.Deferred();
    $.ajax({
      url: "/goseksp/wsdl-check"
    })
    .done(function(data, textStatus, jqXHR){
      $loading.hide();
      $success.show();
      dfd.resolve(true);
    })
    .fail(function(jqXHR, textStatus, errorThrown){
      $loading.hide();
      $fail.show();
      dfd.resolve(false);
    });
    return dfd.promise();
  }

  $.when(wfButtons(), wsdlChecker()).done(function(buttons, available){
    if (available) {
      $(buttons).attr("disabled", null);
    }
  })
  
});
