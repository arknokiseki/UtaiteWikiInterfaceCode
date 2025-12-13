export {};

(function ($, mw) {
    'use strict';

    const MAX_CHARS = 120;
    const BATCH_SIZE = 20;

    class TextExtractsLoader {
        private $placeholders: JQuery;

        constructor() {
            this.$placeholders = $('.js-text-extract');
            
            if (this.$placeholders.length > 0) {
                this.init();
            }
        }

        private init() {
            const pagesToFetch: string[] = [];
            const self = this;
            
            this.$placeholders.each(function (_: number, el: HTMLElement) {
                const page = $(el).data('page');
                if (page && pagesToFetch.indexOf(page) === -1) {
                    pagesToFetch.push(page);
                }
            });

            if (pagesToFetch.length === 0) return;

            let chain: JQuery.Promise<any> = $.Deferred().resolve().promise();

            for (let i = 0; i < pagesToFetch.length; i += BATCH_SIZE) {
                const batch = pagesToFetch.slice(i, i + BATCH_SIZE);
                chain = chain.then(function() {
                    return self.fetchExtracts(batch);
                });
            }
        }

        private fetchExtracts(titles: string[]) {
            const self = this;
            const api = new mw.Api();
            
            return api.get({
                action: 'query',
                prop: 'extracts',
                titles: titles.join('|'),
                exchars: MAX_CHARS,
                exintro: true,
                explaintext: true,
                exsectionformat: 'plain'
            }).then(function (response) {
                const pages = response && response.query && response.query.pages;
                if (!pages) return;

                $.each(pages, function(_, pageData: any) {
                    if (pageData.extract) {
                        self.updatePlaceholder(pageData.title, pageData.extract);
                    } else if (pageData.missing !== undefined) {
                        self.updatePlaceholder(pageData.title, "(Page not found)");
                    } else {
                        self.updatePlaceholder(pageData.title, ""); 
                    }
                });
            }).fail(function (error) {
                console.error('[TextExtractsLoader] API Error:', error);
                self.$placeholders.find('.extract-loading').text('(Preview unavailable)');
            });
        }

        private updatePlaceholder(title: string, text: string) {
            const $target = this.$placeholders.filter(function() {
                return $(this).data('page') === title;
            });

            if (!text) {
                $target.empty(); 
                return;
            }

            const finalText = text + (text.length >= MAX_CHARS ? '...' : '');
            $target.empty().text(finalText);
        }
    }

    $(function () {
        new TextExtractsLoader();
    });

})(jQuery, mediaWiki);