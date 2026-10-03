(function () {
    jQuery(function ($) {
        try {
            var $container = $('#user-page-right .profile-info-container');
            if (!$container.length) return;

            var monthNames = {
                '1':  ['January','Jan','1月','一月'],
                '2':  ['February','Feb','2月','二月'],
                '3':  ['March','Mar','3月','三月'],
                '4':  ['April','Apr','4月','四月'],
                '5':  ['May','May','5月','五月'],
                '6':  ['June','Jun','6月','六月'],
                '7':  ['July','Jul','7月','七月'],
                '8':  ['August','Aug','8月','八月'],
                '9':  ['September','Sep','9月','九月'],
                '10': ['October','Oct','10月','十月'],
                '11': ['November','Nov','11月','十一月'],
                '12': ['December','Dec','12月','十二月']
            };

            function trimStr(s) {
                return (s || '').replace(/^\s+|\s+$/g, '');
            }

            $container.find('div').each(function () {
                var $div = $(this);
                var $b = $div.find('b').first();
                if (!$b.length) return;

                var clone = $div.clone();
                clone.find('b').remove();
                var rawText = trimStr(clone.text());
                if (!rawText) return;

                var trailingMatch = rawText.match(/(?:^|\s)(\d{4})\s*$/);
                if (!trailingMatch) return;

                var token = trailingMatch[1];
                var tokenMatch = token.match(/^([0-1]\d)(\d{2})$/);
                if (!tokenMatch) return;

                var tokenMonth = parseInt(tokenMatch[1], 10);
                var tokenDayMinusOne = parseInt(tokenMatch[2], 10);
                var intendedDay = tokenDayMinusOne + 1;

                if (tokenMonth < 1 || tokenMonth > 12 || intendedDay < 1 || intendedDay > 31) return;

                var dayMonthPattern1 = rawText.match(/^\s*(\d{1,2})\s+([^\d,]+?)\s+\d{4}\s*$/);
                var monthDayPattern2 = rawText.match(/^\s*([^\d,]+?)\s+(\d{1,2})\s+\d{4}\s*$/);
                var displayOrder = 'unknown';
                if (dayMonthPattern1) displayOrder = 'D M T';
                else if (monthDayPattern2) displayOrder = 'M D T';
                else return;

                var correctedMonthNum = tokenMonth.toString();
                var correctedMonthName = monthNames[correctedMonthNum] ? monthNames[correctedMonthNum][0] : null;
                if (!correctedMonthName) return;

                var correctedDayStr = String(intendedDay);
                var correctedDisplay = correctedMonthName + ' ' + correctedDayStr;

                var labelHtml = $b.prop('outerHTML');
                var newHtml = labelHtml + $('<div>').text(correctedDisplay).html();
                $div.html(newHtml);
            });
        } catch (e) {
            if (window.console && console.error) console.error('Birthday fixer error:', e);
        }
    });
})();