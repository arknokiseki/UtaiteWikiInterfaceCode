( function () {
    var CONTAINER_ID = 'recent-all';
    var SELECTOR = 'a';
    var MAX_CHARS = 25;

    function middleTruncate(str, max) {
        if (typeof str !== 'string' || str.length <= max) {
            return str;
        }

        var startLen = Math.ceil((max - 1) / 2);
        var endLen = Math.floor((max - 1) / 2);
        return str.substr(0, startLen) + '…' + str.substr(str.length - endLen, endLen);
    }

    var container = document.getElementById(CONTAINER_ID);
    if (!container) { return; }

    var anchors = container.querySelectorAll('.activity-item ' + SELECTOR + ', .activity-item-bottom ' + SELECTOR);
    for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];

        if (!a || !a.href) { continue; }

        var fullText = a.textContent ? a.textContent.trim() : '';
        if (!fullText) { continue; }

        if (!a.getAttribute('data-fulltitle')) {
            a.setAttribute('data-fulltitle', fullText);
        }

        var shortText = middleTruncate(fullText, MAX_CHARS);

        if (shortText === fullText) { continue; }

        a.setAttribute('title', fullText);

        while (a.firstChild) {
            a.removeChild(a.firstChild);
        }
        a.appendChild(document.createTextNode(shortText));
    }
}() );