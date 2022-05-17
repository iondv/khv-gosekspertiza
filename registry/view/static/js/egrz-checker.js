$(function(){
  var $buttons,
    $success = $('#egrz_check_success'),
    $egrzValidateBtn = $('#egrz_validate'),
    validateUrl = $egrzValidateBtn.data('url'),
    $auth = $('#egrz_auth'),
    $logout = $('#egrz_logout'),
    $loading = $('#egrz_check_loading'),
    $registerModal = $('#workflow-confirmation'),
    $workflowPanel = $('.workflow.panel-workflow'),
    $workflowConfirmBtn = $('#workflow-confirm-btn');

  $loading.show();

  function wfButtons() {
    var dfd = jQuery.Deferred(),
      btnLoadHandler = function(e) {
        $buttons = $(this).find('.btn-group > button');
        $buttons.attr("disabled", "disabled");
        $workflowPanel.unbind('DOMNodeInserted', btnLoadHandler);
        dfd.resolve($buttons);
      };

    $workflowPanel.bind('DOMNodeInserted', btnLoadHandler);
    return dfd.promise();
  }

  function egrzChecker() {
    var dfd = jQuery.Deferred();

    function onSuccess() {
      $loading.hide();
      $success.show();
      $success.data('auth', true);
      $success.trigger('egrz-login-success');
      $egrzValidateBtn.show();
      dfd.resolve(true);
    }

    function onFail() {
      $loading.hide();
      $auth.show();
      $success.data('auth', false);
      $success.trigger('egrz-login-fail');
      dfd.resolve(false);
    }

    $.ajax({
      url: '/goseksp/egrz-check'
    })
    .done(function(data, textStatus, jqXHR){
      if (data && data.auth) {
        onSuccess();
      } else {
        onFail();
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown){
      onFail();
    });
    return dfd.promise();
  }

  $auth.on('click', function() {
    var loginUrl = '/goseksp/egrz/esia-login';
    var windowName = 'esia-login-window';
    var windowParams = 'width=885,height=600,menubar=no,toolbar=no';
    var loginWindow = window.open(loginUrl, windowName, windowParams);
  });

  $auth.on('esia-login-success', function() {
    window.location.reload();
  });

  $logout.on('click', function(event) {
    event.preventDefault();
    $.ajax({
      url: '/goseksp/egrz/logout'
    })
    .done(function(){
      if ($buttons) {
        $buttons.attr("disabled", "disabled");
      }
      $loading.hide();
      $success.hide();
      $auth.show();
    })
    .fail(function(jqXHR, textStatus, errorThrown){
      console.log(textStatus, errorThrown);
    });
  });


  $egrzValidateBtn.on('click', function() {
    if (!validateUrl) {
      return;
    }
    $egrzValidateBtn.addClass('loading');
    $.ajax({
      url: validateUrl
    })
    .done(function(data){
      $egrzValidateBtn.removeClass('loading');
      if (data && data.errorList && data.errorList.length) {
        var message = '<ul>';
        message += data.errorList.map(function(el) { return '<li>' + el.Value + '</li>'; }).join('');
        message += '</ul>';
        messageCallout.error(message);
      } else {
        messageCallout.success('Проверка пройдена успешно');
        $egrzValidateBtn.prop('disabled', true);
      }
    })
    .fail(function(jqXHR, textStatus, errorThrown) {
      $egrzValidateBtn.removeClass('loading');
      messageCallout.error('Ошибка валидации');
      console.log(textStatus, errorThrown);
    });
  });

  $.when(wfButtons(), egrzChecker())
    .done(function(buttons, available){
      if (available) {
        $(buttons).attr("disabled", null);
      }
      var $registerBtn = $buttons.filter("[data-id='expertiseResult@khv-gosekspertiza.register']");
      if ($registerBtn.length) {
        $registerBtn.hide();
        if (available) {
          var $modalToggleBtn = $("<button class='btn btn-default'>Создать в ЕГРЗ</button>");
          $modalToggleBtn.on('click', function(){
            $registerModal.modal('toggle');
          });
          $workflowPanel.find('.btn-group').append($modalToggleBtn);
          $workflowConfirmBtn.on('click', function(){
            $registerBtn.click();
            $registerModal.modal('toggle');
          });
        }
      }
    });
});
