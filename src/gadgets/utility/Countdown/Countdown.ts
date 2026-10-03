// @keep-use-strict: live runs this strict (see plugins/preserve-use-strict.ts)
/**
 * This gadget finds elements with the class "countdown" and replaces them with a
 * dynamic, ticking countdown to a specified date.
 *
 * To use, create an element with the class "countdown". Inside this element,
 * place another element with the class "countdowndate" containing the target
 * date and time.
 *
 * The gadget also supports toggling visibility upon completion.
 *
 * Required HTML Structure:
 * <span class="countdown" data-end="toggle" style="display:none;">
 * <span class="countdowndate" style="display:none;">August 13, 2025 23:59:59 +0000</span>
 * </span>
 * <span class="nocountdown">Ends on August 13, 2025 (UTC)</span>
 * <span class="post-countdown" style="display:none;">Voting has ended.</span>
 */

(function ($, mw) {
  'use strict';

  function updateCountdowns() {
    $('.countdown:not(.countdown-js-attached)').each(function () {
      var $countdownElement = $(this);
      $countdownElement.addClass('countdown-js-attached');

      var $dateElement = $countdownElement.find('.countdowndate');
      if (!$dateElement.length) {
        return;
      }

      var targetDateString = $dateElement.text();
      var targetTime = new Date(targetDateString).getTime();

      if (isNaN(targetTime)) {
        $countdownElement.text('Invalid date');
        $countdownElement.show();
        return;
      }

      $countdownElement.closest('.MessageBox, div').find('.nocountdown').hide();
      $countdownElement.show();

      var timerInterval = setInterval(function () {
        var now = new Date().getTime();
        var distance = targetTime - now;

        if (distance < 0) {
          clearInterval(timerInterval);

          if ($countdownElement.data('end') === 'toggle') {
            var $container = $countdownElement.closest('.MessageBox, div');
            $countdownElement.hide();
            $container.find('.post-countdown').show();
          } else {
            $countdownElement.text('Ended');
          }
          return;
        }

        var days = Math.floor(distance / (1000 * 60 * 60 * 24));
        var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        var seconds = Math.floor((distance % (1000 * 60)) / 1000);

        var output = 'Ends in ';
        var parts = [];

        if (days > 0) {
          parts.push(days + (days === 1 ? ' day' : ' days'));
        }
        if (hours > 0) {
          parts.push(hours + (hours === 1 ? ' hour' : ' hours'));
        }
        if (minutes > 0) {
          parts.push(minutes + (minutes === 1 ? ' minute' : ' minutes'));
        }
        if (parts.length === 0 || seconds > 0) {
          parts.push(seconds + (seconds === 1 ? ' second' : ' seconds'));
        }

        output += parts.slice(0, 2).join(', ');

        $countdownElement.html('<b>' + output + '</b>');

      }, 1000);
    });
  }

  $(document).ready(updateCountdowns);
  mw.hook('wikipage.content').add(updateCountdowns);

}(jQuery, mediaWiki));

export {};
