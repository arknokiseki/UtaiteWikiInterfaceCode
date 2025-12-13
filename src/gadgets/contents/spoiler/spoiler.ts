$(function (): void {
    // Spoiler block behavior
    $('.spoiler').on('click', function (): void {
        $(this).toggleClass('off');
    });

    // Spoiler button behavior
    const $spoilerBtn = $('#spoilerbtn');
    $spoilerBtn.text('Show all spoilers');

    $spoilerBtn.on('click', function (): void {
        const $this = $(this);
        $this.toggleClass('hide');
        $('.spoiler').toggleClass('showall');

        if ($this.is('.hide')) {
            $this.text('Hide all spoilers');
        } else {
            $this.text('Show all spoilers');
        }
    });
});