/**
 * Discord Widget Integration
 * @version 1.1.7
 * Ported from Vocaloid Lyrics Wiki common.js
 */

(function ($: JQueryStatic): void {
    'use strict';

    const $widgetElement = $("#discord-widget");

    // Guard clause: Exit if the container doesn't exist on the page
    if (!$widgetElement.length) {
        return;
    }

    // Extract data attributes (jQuery automatically parses numbers)
    const id = $widgetElement.data("id") as string | number;
    const theme = $widgetElement.data("theme") as string;
    const width = $widgetElement.data("width") as string | number;
    const height = $widgetElement.data("height") as string | number;

    const src = `https://discord.com/widget?id=${id}&theme=${theme}`;

    // Create iframe with specific permissions required for Discord widgets
    const $iframe = $("<iframe>", {
        src: src,
        width: width,
        height: height,
        allowtransparency: "true",
        frameborder: "0",
        sandbox: "allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
    });

    $widgetElement.empty().append($iframe);

})(jQuery);