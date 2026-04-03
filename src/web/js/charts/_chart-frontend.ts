const chartsLocation = document.getElementById('charts-location');
if (chartsLocation) {
  const showPointPopover = (button: HTMLElement) => {
    const chart = button.closest('.chart');
    const popover = chart?.querySelector('.point-popover') as HTMLElement | null;
    if (!popover) return;
    const series = button.closest('.series') as HTMLElement | null;
    const seriesLabel = series?.dataset?.seriesLabel || '';
    const label = button.dataset.label || 'item';
    const value = button.dataset.value || '';
    const rect = button.getBoundingClientRect();
    popover.textContent = `${seriesLabel ? `${seriesLabel} · ` : ''}${label}: ${value}`;
    popover.style.left = `${rect.left + rect.width / 2}px`;
    popover.style.top = `${rect.top - 10}px`;
    popover.style.translate = '-50% -100%';
    if (!popover.matches(':popover-open')) {
      popover.showPopover();
    }
  };

  const hidePointPopover = (button: HTMLElement) => {
    const chart = button.closest('.chart');
    const popover = chart?.querySelector('.point-popover') as HTMLElement | null;
    if (!popover) return;
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    }
  };

  const getPointBtn = (e: Event) =>
    (e.target as HTMLElement).closest('.point-btn, .bar-segment') as HTMLElement | null;

  chartsLocation.addEventListener('mouseover', (e) => {
    const button = getPointBtn(e);
    if (button) showPointPopover(button);
  });

  chartsLocation.addEventListener('mouseout', (e) => {
    const button = getPointBtn(e);
    if (button) hidePointPopover(button);
  });

  chartsLocation.addEventListener('focusin', (e) => {
    const button = getPointBtn(e);
    if (button) showPointPopover(button);
  });

  chartsLocation.addEventListener('focusout', (e) => {
    const button = getPointBtn(e);
    if (button) hidePointPopover(button);
  });
}
