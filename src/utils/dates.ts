// Friendly date formatting shared across screens.

export function formatDateFriendly(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const monthIndex = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const getOrdinalSuffix = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  };
  
  return `${day}${getOrdinalSuffix(day)} of ${months[monthIndex]}`;
}

/** Format an ISO datetime string as e.g. "1st June 2026 at 2:30 PM" */
export function formatDateTimeFriendly(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const getOrdinalSuffix = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return `${day}${getOrdinalSuffix(day)} ${month} ${year} at ${time}`;
}
