export function showFlash(msg, isError = false) {
    const flash = document.createElement('div');
    flash.className = 'success-flash';
    flash.textContent = msg;
    if (isError) {
        flash.style.background = 'rgba(255,90,90,0.12)';
        flash.style.borderColor = '#ff5a5a';
        flash.style.color = '#ff5a5a';
    }
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 2500);
}