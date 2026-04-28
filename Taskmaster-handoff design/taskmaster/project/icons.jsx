// Icons.jsx — minimal stroke icons (no emoji, no slop)
const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.7 }) => {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round",
    style: { display: "block", flexShrink: 0 }
  };
  switch (name) {
    case "inbox":
      return <svg {...props}><path d="M3 13l3-9h12l3 9"/><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>;
    case "today":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/><circle cx="12" cy="14" r="2"/></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/></svg>;
    case "flag":
      return <svg {...props}><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>;
    case "checklist":
      return <svg {...props}><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6l1 1 2-2"/><path d="M4 12l1 1 2-2"/><path d="M4 18l1 1 2-2"/></svg>;
    case "archive":
      return <svg {...props}><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 13h4"/></svg>;
    case "trash":
      return <svg {...props}><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>;
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14"/><path d="M5 12h14"/></svg>;
    case "minus":
      return <svg {...props}><path d="M5 12h14"/></svg>;
    case "x":
      return <svg {...props}><path d="M6 6l12 12"/><path d="M18 6l-12 12"/></svg>;
    case "check":
      return <svg {...props}><path d="M5 12l5 5 9-11"/></svg>;
    case "play":
      return <svg {...props} fill="currentColor" stroke="none"><path d="M7 5v14l12-7z"/></svg>;
    case "pause":
      return <svg {...props} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case "skip":
      return <svg {...props} fill="currentColor" stroke="none"><path d="M6 5l9 7-9 7z"/><rect x="16" y="5" width="2" height="14" rx="1"/></svg>;
    case "back":
      return <svg {...props} fill="currentColor" stroke="none"><path d="M18 5l-9 7 9 7z"/><rect x="6" y="5" width="2" height="14" rx="1"/></svg>;
    case "more":
      return <svg {...props}><circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/></svg>;
    case "edit":
      return <svg {...props}><path d="M14 4l6 6"/><path d="M4 20h4l12-12-4-4L4 16z"/></svg>;
    case "lock":
      return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
    case "unlock":
      return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7-2.6"/></svg>;
    case "timer":
      return <svg {...props}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 3h6"/></svg>;
    case "flame":
      return <svg {...props}><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 1 3 1-1-2 0-3 0-4z"/></svg>;
    case "battery":
      return <svg {...props}><rect x="2" y="8" width="18" height="8" rx="2"/><rect x="22" y="11" width="1" height="2"/><rect x="4" y="10" width="11" height="4" fill="currentColor" stroke="none"/></svg>;
    case "wifi":
      return <svg {...props}><path d="M2 9a15 15 0 0 1 20 0"/><path d="M5 12a11 11 0 0 1 14 0"/><path d="M8.5 15.5a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg>;
    case "bell":
      return <svg {...props}><path d="M6 16V11a6 6 0 1 1 12 0v5l1 2H5z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>;
    case "sun":
      return <svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>;
    case "moon":
      return <svg {...props}><path d="M20 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z"/></svg>;
    case "filter":
      return <svg {...props}><path d="M4 5h16l-6 8v6l-4-2v-4z"/></svg>;
    case "sort":
      return <svg {...props}><path d="M7 4v16M3 16l4 4 4-4"/><path d="M17 20V4M13 8l4-4 4 4"/></svg>;
    case "command":
      return <svg {...props}><path d="M9 9h6v6H9z"/><path d="M9 9V6a3 3 0 1 0-3 3h3z"/><path d="M15 9V6a3 3 0 1 1 3 3h-3z"/><path d="M9 15v3a3 3 0 1 1-3-3h3z"/><path d="M15 15v3a3 3 0 1 0 3-3h-3z"/></svg>;
    case "expand":
      return <svg {...props}><path d="M9 18l-6 6"/><path d="M3 24v-6h6"/><path d="M15 6l6-6"/><path d="M21 0v6h-6"/></svg>;
    case "chevron-right":
      return <svg {...props}><path d="M9 6l6 6-6 6"/></svg>;
    case "chevron-down":
      return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case "sparkles":
      return <svg {...props}><path d="M12 4l1.5 4.5L18 10l-4.5 1.5L12 16l-1.5-4.5L6 10l4.5-1.5z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>;
    default:
      return null;
  }
};

window.Icon = Icon;
