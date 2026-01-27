/**
 * Dashboard V2 - Kid-Centric Dark Mode Dashboard
 *
 * New hybrid UI with:
 * - Left sidebar with kid selection
 * - Dark mode color scheme
 * - Life Areas grid
 * - Status cards
 * - Needs Attention banner
 * - Summary/Emails tabs preserved
 */

export function generateDashboardV2HTML(familyMembers: { name: string; aliases?: string[] }[]): string {
  const kids = familyMembers.map(m => m.name);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Family Concierge - Dashboard</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        :root {
          --bg-primary: #0f172a;
          --bg-secondary: #1e293b;
          --bg-tertiary: #334155;
          --border-color: #3d4f6a;
          --text-primary: #f8fafc;
          --text-secondary: #94a3b8;
          --text-tertiary: #64748b;
          --accent-blue: #3b82f6;
          --accent-blue-hover: #2563eb;
          --highlight-amber: #fbbf24;
          --alert-orange: #f59e0b;
          --success-green: #10b981;
          --danger-red: #dc2626;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(180deg, #0f172a 0%, #1a1f35 100%);
          color: var(--text-primary);
          font-size: 22px;
          min-height: 100vh;
          display: flex;
        }

        /* Sidebar */
        .sidebar {
          width: 280px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          position: fixed;
          height: 100vh;
          overflow-y: auto;
        }

        .sidebar-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .logo-icon {
          font-size: 1.75rem;
        }

        .logo-text {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .current-date {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .sidebar-section {
          padding: 1.25rem;
        }

        .sidebar-section-title {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-tertiary);
          margin-bottom: 1rem;
        }

        .kid-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .kid-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: var(--bg-tertiary);
          border: 1px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .kid-card:hover {
          background: #3d4a5c;
        }

        .kid-card.active {
          background: var(--accent-blue);
          border-color: var(--accent-blue);
        }

        .kid-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          font-weight: 600;
        }

        .kid-card.active .kid-avatar {
          background: rgba(255,255,255,0.2);
        }

        .kid-info {
          flex: 1;
        }

        .kid-name {
          font-weight: 600;
          font-size: 0.95rem;
        }

        .kid-subtitle {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .kid-card.active .kid-subtitle {
          color: rgba(255,255,255,0.8);
        }

        .kid-badge {
          background: var(--alert-orange);
          color: var(--bg-primary);
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: 10px;
          min-width: 24px;
          text-align: center;
        }

        .all-family-card {
          background: transparent;
          border: 1px dashed var(--border-color);
        }

        .all-family-card:hover {
          background: var(--bg-tertiary);
          border-style: solid;
        }

        .quick-actions {
          margin-top: auto;
          padding: 1.25rem;
          border-top: 1px solid var(--border-color);
        }

        .quick-action-btn {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-secondary);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 0.5rem;
          text-decoration: none;
        }

        .quick-action-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        /* Main Content */
        .main-content {
          flex: 1;
          margin-left: 280px;
          padding: 2rem;
          overflow-y: auto;
        }

        /* Child Header */
        .child-header {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          margin-bottom: 2rem;
        }

        .child-avatar-large {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          font-weight: 600;
        }

        .child-title h1 {
          font-size: 42px;
          font-weight: 700;
          margin-bottom: 0.25rem;
        }

        .child-title p {
          color: var(--text-secondary);
          font-size: 22px;
        }

        /* Section Label */
        .section-label {
          font-size: 14px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #94a3b8;
          margin-bottom: 14px;
        }

        /* Top Row: Upcoming Events + School side by side */
        .top-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }

        /* Upcoming Events Card */
        .upcoming-events-card {
          background: linear-gradient(180deg, #1e293b 0%, #253348 100%);
          border-radius: 16px;
          border: 1px solid #3d4f6a;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .upcoming-events-header {
          padding: 18px 20px;
          border-bottom: 1px solid #3d4f6a;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .upcoming-events-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .upcoming-events-title span.icon {
          font-size: 1.5rem;
        }

        .upcoming-events-title h3 {
          font-weight: 700;
          font-size: 24px;
          color: white;
          margin: 0;
        }

        .upcoming-events-subtitle {
          font-size: 18px;
          color: #94a3b8;
        }

        .upcoming-events-body {
          flex: 1;
          max-height: 400px;
          overflow-y: auto;
          padding: 16px;
        }

        .upcoming-event-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px;
          background: rgba(59, 130, 246, 0.05);
          border-radius: 12px;
          margin-bottom: 12px;
          border: 1px solid rgba(59, 130, 246, 0.1);
          transition: all 0.2s;
        }

        .upcoming-event-item:hover {
          background: rgba(59, 130, 246, 0.1);
        }

        .event-date-badge {
          background: linear-gradient(135deg, #1e40af, #3b82f6);
          border-radius: 10px;
          padding: 8px 12px;
          text-align: center;
          min-width: 54px;
        }

        .event-date-badge .month {
          font-size: 11px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.8);
          letter-spacing: 0.5px;
        }

        .event-date-badge .day {
          font-size: 20px;
          font-weight: 700;
          color: white;
          line-height: 1.2;
        }

        .event-details {
          flex: 1;
        }

        .event-title {
          font-size: 20px;
          font-weight: 600;
          color: #e2e8f0;
          margin-bottom: 4px;
        }

        .event-meta {
          font-size: 18px;
          color: #94a3b8;
        }

        .event-time {
          color: #60a5fa;
          font-weight: 500;
        }

        .event-person-tag {
          display: inline-block;
          background: rgba(139, 92, 246, 0.2);
          color: #a78bfa;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          margin-left: 8px;
        }

        .no-events {
          color: #64748b;
          font-size: 14px;
          text-align: center;
          padding: 35px 12px;
        }

        /* Urgent Action Banner */
        .urgent-action {
          background: linear-gradient(135deg, #991b1b, #dc2626);
          border-radius: 18px;
          padding: 24px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 28px;
          box-shadow: 0 8px 32px rgba(220, 38, 38, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .urgent-action.hidden {
          display: none;
        }

        .urgent-action-left {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .urgent-action-icon {
          width: 56px;
          height: 56px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
        }

        .urgent-action-content h3 {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 6px;
          color: white;
        }

        .urgent-action-content span {
          font-size: 15px;
          color: rgba(255, 255, 255, 0.85);
        }

        .urgent-action-buttons {
          display: flex;
          gap: 12px;
        }

        .dismiss-btn {
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 12px 20px;
          border-radius: 10px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .dismiss-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .primary-btn {
          background: white;
          color: #dc2626;
          border: none;
          padding: 14px 28px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          transition: all 0.2s;
        }

        .primary-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }

        /* School Card (in top row) */
        .school-card {
          background: linear-gradient(180deg, #1e293b 0%, #253348 100%);
          border-radius: 16px;
          border: 1px solid #3d4f6a;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .school-card-header {
          padding: 18px 20px;
          border-bottom: 1px solid #3d4f6a;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .school-card-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .school-card-title span.icon {
          font-size: 1.5rem;
        }

        .school-card-title h3 {
          font-weight: 700;
          font-size: 24px;
          color: white;
          margin: 0;
        }

        .school-bullets {
          list-style: none;
          padding: 16px 20px;
          margin: 0;
          max-height: 360px;
          overflow-y: auto;
        }

        .school-bullet-item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid rgba(61, 79, 106, 0.5);
        }

        .school-bullet-item:last-child {
          border-bottom: none;
        }

        .school-bullet-text {
          flex: 1;
          color: #e2e8f0;
          font-size: 20px;
          line-height: 1.6;
        }

        .school-bullet-text strong {
          color: #fbbf24;
        }

        .school-summary {
          padding: 16px 20px;
          background: rgba(59, 130, 246, 0.05);
          border-bottom: 1px solid rgba(61, 79, 106, 0.5);
          color: #e2e8f0;
          font-size: 20px;
          line-height: 1.6;
        }

        .date-highlight {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          color: #1e293b;
          padding: 3px 10px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 18px;
          display: inline-block;
          margin-right: 10px;
        }

        .view-email-btn {
          background: transparent;
          color: #60a5fa;
          border: 1px solid rgba(96, 165, 250, 0.3);
          padding: 6px 16px;
          border-radius: 6px;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          margin-left: 12px;
        }

        .view-email-btn:hover {
          background: rgba(96, 165, 250, 0.1);
          border-color: #60a5fa;
        }

        /* Activities Card (full width) */
        .activities-section {
          margin-bottom: 24px;
        }

        .activities-card {
          background: linear-gradient(180deg, #1e293b 0%, #253348 100%);
          border-radius: 16px;
          border: 1px solid #3d4f6a;
          overflow: hidden;
        }

        .activities-header {
          padding: 18px 20px;
          border-bottom: 1px solid #3d4f6a;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .activities-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .activities-title span.icon {
          font-size: 1.5rem;
        }

        .activities-title h3 {
          font-weight: 700;
          font-size: 24px;
          color: white;
          margin: 0;
        }

        .activities-subtitle {
          font-size: 18px;
          color: #94a3b8;
          margin-left: 8px;
        }

        .activities-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0;
        }

        .activity-column {
          padding: 20px;
          border-right: 1px solid rgba(61, 79, 106, 0.5);
        }

        .activity-column:last-child {
          border-right: none;
        }

        .activity-column-title {
          font-size: 18px;
          font-weight: 600;
          color: #60a5fa;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 16px;
        }

        .activity-entry {
          padding: 12px 0;
          border-bottom: 1px solid rgba(61, 79, 106, 0.3);
        }

        .activity-entry:last-child {
          border-bottom: none;
        }

        .activity-entry-date {
          font-size: 18px;
          color: #94a3b8;
          margin-bottom: 4px;
        }

        .activity-entry-title {
          font-size: 20px;
          color: #e2e8f0;
          font-weight: 500;
          margin-bottom: 4px;
        }

        .activity-entry-person {
          font-size: 16px;
          color: #a78bfa;
        }

        .activity-view-link {
          display: inline-block;
          color: #60a5fa;
          font-size: 18px;
          margin-top: 6px;
          cursor: pointer;
        }

        .activity-view-link:hover {
          text-decoration: underline;
        }

        /* Opportunities Section */
        .opportunities-section {
          margin-top: 24px;
        }

        .opportunities-card {
          background: linear-gradient(180deg, #1e293b 0%, #253348 100%);
          border-radius: 16px;
          border: 1px solid #3d4f6a;
          padding: 20px;
        }

        .opportunities-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .opportunities-header span.icon {
          font-size: 1.5rem;
        }

        .opportunities-header h3 {
          font-weight: 700;
          font-size: 24px;
          color: white;
          margin: 0;
        }

        .opportunities-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .opportunity-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 20px;
          padding: 8px 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .opportunity-pill:hover {
          background: rgba(59, 130, 246, 0.2);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .opportunity-pill span.pill-text {
          color: #e2e8f0;
          font-size: 18px;
        }

        .opportunity-pill span.pill-date {
          color: #94a3b8;
          font-size: 16px;
        }

        /* Legacy Life Areas Grid (kept for backwards compat) */
        .life-areas-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .life-area-card {
          background: linear-gradient(180deg, #1e293b 0%, #253348 100%);
          border: 1px solid #3d4f6a;
          border-radius: 16px;
          overflow: hidden;
        }

        .life-area-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid #3d4f6a;
        }

        .life-area-title-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .life-area-icon {
          font-size: 1.5rem;
          margin-bottom: 4px;
        }

        .life-area-name {
          font-weight: 700;
          font-size: 17px;
          color: white;
        }

        .life-area-subtitle {
          font-size: 13px;
          color: #94a3b8;
        }

        .life-area-count {
          background: var(--accent-blue);
          color: white;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
        }

        /* Activity Item Styling */
        .activity-item {
          padding: 16px 0;
          border-bottom: 1px solid rgba(61, 79, 106, 0.5);
        }

        .activity-item:last-child {
          border-bottom: none;
        }

        .activity-date {
          font-size: 14px;
          color: #60a5fa;
          margin-bottom: 6px;
          font-weight: 600;
        }

        .activity-title {
          font-size: 18px;
          font-weight: 700;
          color: #fbbf24;
          margin-bottom: 6px;
        }

        .activity-desc {
          font-size: 15px;
          color: #e2e8f0;
          line-height: 1.6;
        }

        /* Summary bullet points */
        .summary-bullets {
          list-style: none;
          padding: 0;
          margin: 12px 0;
        }

        .summary-bullets li {
          padding: 8px 0;
          font-size: 15px;
          color: #e2e8f0;
          line-height: 1.6;
        }

        .summary-bullets li strong {
          color: #fbbf24;
        }

        /* Tabs */
        .area-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-color);
        }

        .area-tab {
          flex: 1;
          padding: 0.75rem;
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .area-tab:hover {
          color: var(--text-secondary);
        }

        .area-tab.active {
          color: var(--accent-blue);
        }

        .area-tab.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--accent-blue);
        }

        .area-content {
          padding: 1.25rem;
          min-height: 200px;
        }

        .area-tab-content {
          display: none;
        }

        .area-tab-content.active {
          display: block;
        }

        /* Summary Content */
        .summary-content {
          color: var(--text-secondary);
          line-height: 1.7;
          font-size: 0.95rem;
        }

        .summary-content p {
          margin-bottom: 1rem;
        }

        .engagement-tip {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%);
          border-left: 3px solid var(--accent-blue);
          border-radius: 0 8px 8px 0;
          padding: 1rem;
          margin-top: 1rem;
        }

        .engagement-tip-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--accent-blue);
          margin-bottom: 0.5rem;
        }

        .engagement-tip-text {
          color: var(--text-primary);
          font-style: italic;
        }

        /* Email List */
        .email-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .email-item {
          background: var(--bg-tertiary);
          border-radius: 8px;
          padding: 1rem;
          transition: background 0.2s;
        }

        .email-item:hover {
          background: #3d4a5c;
        }

        .email-item-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }

        .email-item-title {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .email-item-date {
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }

        .email-item-meta {
          font-size: 0.8rem;
          color: var(--text-tertiary);
          margin-bottom: 0.75rem;
        }

        .email-item-actions {
          display: flex;
          gap: 0.5rem;
        }

        .btn-view {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }

        .btn-view:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .btn-gmail {
          background: var(--accent-blue);
          color: white;
          border: none;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }

        .btn-gmail:hover {
          background: var(--accent-blue-hover);
        }

        .btn-dismiss {
          background: transparent;
          color: var(--text-tertiary);
          border: 1px solid var(--border-color);
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-dismiss:hover {
          background: var(--danger-red);
          border-color: var(--danger-red);
          color: white;
        }

        .btn-done {
          background: var(--success-green);
          color: white;
          border: none;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-done:hover {
          background: #059669;
        }

        /* Email Body Container */
        .email-body-container {
          display: none;
          margin-top: 1rem;
          padding: 1rem;
          background: var(--bg-primary);
          border-radius: 8px;
          border: 1px solid var(--border-color);
          max-height: 400px;
          overflow-y: auto;
          color: var(--text-secondary);
        }

        .email-body-container.show {
          display: block;
        }

        .email-body-container img {
          max-width: 100%;
          height: auto;
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 2rem;
          color: var(--text-tertiary);
        }

        .empty-state-icon {
          font-size: 2.5rem;
          margin-bottom: 0.75rem;
          opacity: 0.5;
        }

        .empty-state-title {
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
        }

        .empty-state-text {
          font-size: 0.9rem;
        }

        /* Loading */
        .loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          color: var(--text-tertiary);
        }

        .loading::before {
          content: '';
          width: 20px;
          height: 20px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-blue);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 0.75rem;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Chat Widget */
        .chat-toggle {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          transition: transform 0.2s, box-shadow 0.2s;
          z-index: 999;
        }

        .chat-toggle:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(99, 102, 241, 0.5);
        }

        .chat-panel {
          position: fixed;
          bottom: 96px;
          right: 24px;
          width: 380px;
          max-height: 500px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          display: none;
          flex-direction: column;
          z-index: 1000;
          overflow: hidden;
        }

        .chat-panel.open {
          display: flex;
        }

        .chat-header {
          padding: 16px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 20px;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          max-height: 300px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-message {
          padding: 10px 14px;
          border-radius: 12px;
          max-width: 85%;
          line-height: 1.4;
          font-size: 14px;
        }

        .chat-message.user {
          background: var(--accent-blue);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }

        .chat-input-area {
          padding: 12px;
          border-top: 1px solid var(--border-color);
          display: flex;
          gap: 8px;
        }

        .chat-input {
          flex: 1;
          padding: 10px 14px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
        }

        .chat-input:focus {
          border-color: var(--accent-blue);
        }

        .chat-send {
          padding: 10px 16px;
          background: var(--accent-blue);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
        }

        .chat-send:disabled {
          background: var(--bg-tertiary);
          cursor: not-allowed;
        }

        /* Modal */
        .modal {
          display: none;
          position: fixed;
          z-index: 1000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          align-items: center;
          justify-content: center;
        }

        .modal.show {
          display: flex;
        }

        .modal-content {
          background: var(--bg-secondary);
          padding: 2rem;
          border-radius: 12px;
          max-width: 500px;
          width: 90%;
          border: 1px solid var(--border-color);
        }

        .modal-header {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text-primary);
        }

        .modal-body textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 0.95rem;
          font-family: inherit;
          min-height: 100px;
          resize: vertical;
        }

        .modal-footer {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .btn-cancel {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: none;
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          cursor: pointer;
        }

        .btn-confirm {
          background: var(--accent-blue);
          color: white;
          border: none;
          padding: 0.6rem 1.25rem;
          border-radius: 8px;
          cursor: pointer;
        }

        /* Email Viewer Modal */
        .email-viewer-modal {
          display: none;
          position: fixed;
          z-index: 2000;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          align-items: center;
          justify-content: center;
        }

        .email-viewer-modal.show {
          display: flex;
        }

        .email-viewer-content {
          background: var(--bg-secondary);
          border-radius: 16px;
          max-width: 800px;
          width: 90%;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border-color);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }

        .email-viewer-header {
          padding: 20px 24px;
          background: linear-gradient(135deg, #1e293b 0%, #253348 100%);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .email-viewer-title {
          flex: 1;
          padding-right: 16px;
        }

        .email-viewer-subject {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .email-viewer-meta {
          font-size: 0.875rem;
          color: var(--text-secondary);
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
        }

        .email-viewer-meta .meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .email-viewer-meta .meta-label {
          color: var(--text-tertiary);
        }

        .email-viewer-close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: var(--text-secondary);
          width: 36px;
          height: 36px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .email-viewer-close:hover {
          background: rgba(255, 255, 255, 0.2);
          color: var(--text-primary);
        }

        .email-viewer-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          background: var(--bg-primary);
          color: var(--text-secondary);
          line-height: 1.7;
          font-size: 0.95rem;
        }

        .email-viewer-body img {
          max-width: 100%;
          height: auto;
          border-radius: 4px;
        }

        .email-viewer-body a {
          color: var(--accent-blue);
        }

        .email-viewer-body table {
          border-collapse: collapse;
          max-width: 100%;
        }

        .email-viewer-body td, .email-viewer-body th {
          padding: 8px;
          border: 1px solid var(--border-color);
        }

        .email-viewer-body blockquote {
          border-left: 3px solid var(--accent-blue);
          margin: 12px 0;
          padding-left: 16px;
          color: var(--text-tertiary);
        }

        .email-viewer-footer {
          padding: 16px 24px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .email-viewer-actions {
          display: flex;
          gap: 12px;
        }

        .btn-open-gmail {
          background: linear-gradient(135deg, #ea4335, #d93025);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .btn-open-gmail:hover {
          background: linear-gradient(135deg, #d93025, #c5221f);
          transform: translateY(-1px);
        }

        .btn-close-viewer {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-close-viewer:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .email-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--text-tertiary);
        }

        .email-loading::before {
          content: '';
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color);
          border-top-color: var(--accent-blue);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        .email-no-content {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-tertiary);
        }

        .email-no-content-icon {
          font-size: 3rem;
          margin-bottom: 12px;
          opacity: 0.5;
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .top-row {
            grid-template-columns: 1fr;
          }
          .activities-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 900px) {
          .sidebar {
            width: 240px;
          }
          .main-content {
            margin-left: 240px;
          }
          .activities-grid {
            grid-template-columns: 1fr;
          }
          .activity-column {
            border-right: none;
            border-bottom: 1px solid rgba(61, 79, 106, 0.5);
          }
          .activity-column:last-child {
            border-bottom: none;
          }
        }
      </style>
    </head>
    <body>
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <span class="logo-icon">📅</span>
            <span class="logo-text">Family Concierge</span>
          </div>
          <div class="current-date" id="currentDate"></div>
        </div>

        <div class="sidebar-section">
          <div class="sidebar-section-title">Your Kids</div>
          <div class="kid-list" id="kidList">
            <div class="kid-card all-family-card active" data-person="all" onclick="selectChild('all')">
              <div class="kid-avatar">👨‍👩‍👧‍👦</div>
              <div class="kid-info">
                <div class="kid-name">All Family</div>
                <div class="kid-subtitle">Overview</div>
              </div>
            </div>
            ${kids.map(kid => `
            <div class="kid-card" data-person="${kid}" onclick="selectChild('${kid}')">
              <div class="kid-avatar">${kid.charAt(0)}</div>
              <div class="kid-info">
                <div class="kid-name">${kid}</div>
                <div class="kid-subtitle">0 updates</div>
              </div>
              <div class="kid-badge" style="display: none;">0</div>
            </div>
            `).join('')}
          </div>
        </div>

        <div class="quick-actions">
          <a href="/audit" class="quick-action-btn">
            <span>📊</span> View Audit Log
          </a>
          <a href="/recipients-page" class="quick-action-btn">
            <span>👥</span> Manage Recipients
          </a>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <!-- Header -->
        <div class="child-header" id="childHeader">
          <div class="child-title">
            <h1 id="headerTitle">Ian's Week</h1>
            <p id="headerSubtitle">Here's what's coming up for your family</p>
          </div>
        </div>

        <!-- Urgent Action Banner -->
        <div class="urgent-action hidden" id="urgentActionBanner">
          <div class="urgent-action-left">
            <div class="urgent-action-icon" id="urgentIcon">✍️</div>
            <div class="urgent-action-content">
              <h3 id="urgentTitle">Action Required</h3>
              <span id="urgentText">You have items that need your attention</span>
            </div>
          </div>
          <div class="urgent-action-buttons">
            <button class="dismiss-btn" onclick="dismissUrgentItem()">Dismiss</button>
            <button class="primary-btn" onclick="viewUrgentItem()">Review</button>
          </div>
        </div>

        <!-- Top Row: Upcoming Events + What's Happening at School -->
        <div class="top-row">
          <!-- Upcoming Events Card -->
          <div class="upcoming-events-card">
            <div class="upcoming-events-header">
              <div class="upcoming-events-title">
                <span class="icon">📅</span>
                <div>
                  <h3>Upcoming Events</h3>
                  <span class="upcoming-events-subtitle">Next 45 days</span>
                </div>
              </div>
              <span class="life-area-count" id="upcoming-count">0</span>
            </div>
            <div class="upcoming-events-body" id="upcomingEventsBody">
              <div class="loading">Loading events...</div>
            </div>
          </div>

          <!-- What's Happening at School Card -->
          <div class="school-card">
            <div class="school-card-header">
              <div class="school-card-title">
                <span class="icon">🏫</span>
                <h3>What's Happening at School</h3>
              </div>
              <span class="life-area-count" id="school-count">0</span>
            </div>
            <div class="school-summary" id="schoolSummary">
              Loading summary...
            </div>
            <ul class="school-bullets" id="schoolBullets">
              <li class="loading">Loading school updates...</li>
            </ul>
          </div>
        </div>

        <!-- Activities & Lessons (Full Width) -->
        <div class="activities-section">
          <div class="activities-card">
            <div class="activities-header">
              <div class="activities-title">
                <span class="icon">⚽</span>
                <h3>Activities & Lessons</h3>
                <span class="activities-subtitle">Swimming, Piano, Music</span>
              </div>
              <span class="life-area-count" id="activities-count">0</span>
            </div>
            <div class="activities-grid" id="activitiesGrid">
              <div class="activity-column">
                <div class="activity-column-title">This Week</div>
                <div id="activities-thisweek">
                  <div class="loading">Loading...</div>
                </div>
              </div>
              <div class="activity-column">
                <div class="activity-column-title">Next Week</div>
                <div id="activities-nextweek">
                  <div class="loading">Loading...</div>
                </div>
              </div>
              <div class="activity-column">
                <div class="activity-column-title">Coming Up</div>
                <div id="activities-later">
                  <div class="loading">Loading...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Opportunities to Get More Involved -->
        <div class="opportunities-section">
          <div class="opportunities-card">
            <div class="opportunities-header">
              <span class="icon">🤝</span>
              <h3>Opportunities to Get More Involved</h3>
            </div>
            <div class="opportunities-pills" id="opportunitiesPills">
              <div class="loading">Loading opportunities...</div>
            </div>
          </div>
        </div>

        <!-- Hidden containers for data (used by attention banner) -->
        <div style="display:none;">
          <span id="tasks-count">0</span>
          <span id="tasksValue">0</span>
          <span id="updates-count">0</span>
          <span id="updatesValue">0</span>
        </div>
      </main>

      <!-- Dismiss Modal -->
      <div id="dismissModal" class="modal">
        <div class="modal-content">
          <div class="modal-header">Dismiss Item</div>
          <div class="modal-body">
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">Why is this not relevant?</p>
            <textarea id="dismissReason" placeholder="Enter reason (required)"></textarea>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" onclick="closeDismissModal()">Cancel</button>
            <button class="btn-confirm" onclick="confirmDismiss()">Dismiss</button>
          </div>
        </div>
      </div>

      <!-- Email Viewer Modal -->
      <div id="emailViewerModal" class="email-viewer-modal" onclick="if(event.target === this) closeEmailViewer()">
        <div class="email-viewer-content">
          <div class="email-viewer-header">
            <div class="email-viewer-title">
              <div class="email-viewer-subject" id="emailViewerSubject">Loading...</div>
              <div class="email-viewer-meta">
                <span class="meta-item">
                  <span class="meta-label">From:</span>
                  <span id="emailViewerFrom">-</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">Date:</span>
                  <span id="emailViewerDate">-</span>
                </span>
                <span class="meta-item" id="emailViewerPersonContainer" style="display: none;">
                  <span class="meta-label">For:</span>
                  <span id="emailViewerPerson">-</span>
                </span>
              </div>
            </div>
            <button class="email-viewer-close" onclick="closeEmailViewer()" title="Close">×</button>
          </div>
          <div class="email-viewer-body" id="emailViewerBody">
            <div class="email-loading">Loading email content...</div>
          </div>
          <div class="email-viewer-footer">
            <div class="email-viewer-actions">
              <button class="btn-close-viewer" onclick="closeEmailViewer()">Close</button>
            </div>
            <button class="btn-open-gmail" id="emailViewerGmailBtn" onclick="openInGmail()">
              <span>📧</span> Open in Gmail
            </button>
          </div>
        </div>
      </div>

      <!-- Chat Widget -->
      <button class="chat-toggle" onclick="toggleChat()" title="Ask a question">💬</button>
      <div class="chat-panel" id="chatPanel">
        <div class="chat-header">
          <span>Ask Family Concierge</span>
          <button class="chat-close" onclick="toggleChat()">×</button>
        </div>
        <div class="chat-messages" id="chatMessages">
          <div class="chat-message assistant">Hi! I can help answer questions about your family's schedule and emails. What would you like to know?</div>
        </div>
        <div class="chat-input-area">
          <input type="text" class="chat-input" id="chatInput" placeholder="Ask about schedules, events..." onkeydown="if(event.key === 'Enter') sendChatMessage()">
          <button class="chat-send" id="chatSend" onclick="sendChatMessage()">Send</button>
        </div>
      </div>

      <script>
        // State
        let currentChild = 'all';
        let dismissingItemId = null;
        let dismissingItemType = null;

        // Format date for header
        function formatDate(date) {
          return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        }

        // Set current date
        document.getElementById('currentDate').textContent = formatDate(new Date());

        // Select child
        function selectChild(person) {
          currentChild = person;

          // Update sidebar selection
          document.querySelectorAll('.kid-card').forEach(card => {
            card.classList.remove('active');
            if (card.dataset.person === person) {
              card.classList.add('active');
            }
          });

          // Update header
          const title = document.getElementById('headerTitle');
          const subtitle = document.getElementById('headerSubtitle');
          if (person === 'all') {
            title.textContent = "Ian's Week";
            subtitle.textContent = "Here's what's coming up for your family";
          } else {
            title.textContent = \`\${person}'s Week\`;
            subtitle.textContent = \`Here's what's coming up for \${person}\`;
          }

          // Reload all data with filter
          loadAllData();
        }

        // Handle attention action - scroll to activities
        function scrollToTasks() {
          document.querySelector('.activities-section').scrollIntoView({ behavior: 'smooth' });
        }

        // Load all dashboard data
        async function loadAllData() {
          const personParam = currentChild === 'all' ? '' : \`?person=\${encodeURIComponent(currentChild)}\`;

          await Promise.all([
            loadUpcomingEvents(personParam),
            loadSchoolBullets(personParam),
            loadActivities(personParam),
            loadOpportunities(personParam),
            loadTasks(personParam)
          ]);
        }

        // Load Upcoming Events - combines obligations and announcements
        async function loadUpcomingEvents(personParam = '') {
          try {
            // Fetch both obligations and announcements
            const [obligationsRes, announcementsRes] = await Promise.all([
              fetch(\`/api/dashboard/obligations\${personParam}\`),
              fetch(\`/api/dashboard/announcements\${personParam}\`)
            ]);
            const obligations = await obligationsRes.json();
            const announcements = await announcementsRes.json();

            // Combine all items and dedupe by id
            const seen = new Set();
            const allItems = [...obligations.items, ...announcements.items].filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            const container = document.getElementById('upcomingEventsBody');
            document.getElementById('upcoming-count').textContent = allItems.length;

            if (allItems.length === 0) {
              container.innerHTML = '<div class="no-events">No upcoming events</div>';
              return;
            }

            // Sort by date (items with dates first, then by recency)
            const events = allItems
              .sort((a, b) => {
                // Items with effective dates come first, sorted by date
                if (a.effectiveDate && b.effectiveDate) {
                  return new Date(a.effectiveDate) - new Date(b.effectiveDate);
                }
                if (a.effectiveDate) return -1;
                if (b.effectiveDate) return 1;
                // Otherwise sort by created date (newest first)
                return new Date(b.createdAt) - new Date(a.createdAt);
              })
              .slice(0, 20); // Limit to 20 items

            container.innerHTML = events.map(event => {
              const hasDate = event.effectiveDate;
              let dateContent;

              if (hasDate) {
                const eventDate = new Date(event.effectiveDate);
                const month = eventDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
                const day = eventDate.getDate();
                dateContent = \`
                  <div class="event-date-badge">
                    <div class="month">\${month}</div>
                    <div class="day">\${day}</div>
                  </div>
                \`;
              } else {
                // Show "NEW" badge for recent items without dates
                dateContent = \`
                  <div class="event-date-badge" style="background: linear-gradient(135deg, #059669, #10b981);">
                    <div class="day" style="font-size: 14px;">NEW</div>
                  </div>
                \`;
              }

              const time = event.startTime || (hasDate ? 'All day' : 'Recent');

              return \`
                <div class="upcoming-event-item" onclick="viewEmail('\${event.id}')" style="cursor: pointer;">
                  \${dateContent}
                  <div class="event-details">
                    <div class="event-title">\${event.eventTitle || event.subject || 'Update'}</div>
                    <div class="event-meta">
                      <span class="event-time">\${time}</span>
                      \${event.person ? \`<span class="event-person-tag">\${event.person}</span>\` : ''}
                    </div>
                  </div>
                </div>
              \`;
            }).join('');
          } catch (error) {
            console.error('Error loading upcoming events:', error);
          }
        }

        // Load School Bullets - combines obligations and announcements
        async function loadSchoolBullets(personParam = '') {
          try {
            const packFilter = 'packId=school';
            const personSuffix = personParam ? '&' + personParam.substring(1) : '';

            const [obligationsRes, announcementsRes] = await Promise.all([
              fetch(\`/api/dashboard/obligations?\${packFilter}\${personSuffix}\`),
              fetch(\`/api/dashboard/announcements?\${packFilter}\${personSuffix}\`)
            ]);
            const obligations = await obligationsRes.json();
            const announcements = await announcementsRes.json();

            // Combine and dedupe
            const seen = new Set();
            const allItems = [...obligations.items, ...announcements.items].filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            const summaryContainer = document.getElementById('schoolSummary');
            const container = document.getElementById('schoolBullets');
            document.getElementById('school-count').textContent = allItems.length;

            // Show AI summary if available - prefer the one with matching items
            const obligationsCount = obligations.items?.length || 0;
            const announcementsCount = announcements.items?.length || 0;
            let summary;
            if (obligationsCount > 0 && obligations.summary?.summary) {
              summary = obligations.summary.summary;
            } else if (announcementsCount > 0 && announcements.summary?.summary) {
              summary = announcements.summary.summary;
            }
            if (summary && allItems.length > 0) {
              summaryContainer.textContent = summary;
            } else if (allItems.length === 0) {
              summaryContainer.textContent = "No school updates this week. Enjoy the quiet!";
              container.innerHTML = '<li class="no-events">No school updates</li>';
              return;
            } else {
              summaryContainer.textContent = \`\${allItems.length} updates from school this week.\`;
            }

            // Sort by date (newest first for items without effectiveDate)
            const sortedItems = allItems.sort((a, b) => {
              if (a.effectiveDate && b.effectiveDate) {
                return new Date(a.effectiveDate) - new Date(b.effectiveDate);
              }
              if (a.effectiveDate) return -1;
              if (b.effectiveDate) return 1;
              return new Date(b.createdAt) - new Date(a.createdAt);
            });

            container.innerHTML = sortedItems.slice(0, 8).map(item => {
              const dateStr = item.effectiveDate
                ? new Date(item.effectiveDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : '';
              const personStr = item.person && item.person !== 'Family/Shared' ? \` • \${item.person}\` : '';
              const title = item.eventTitle || item.subject || 'School update';

              return \`
                <li class="school-bullet-item" onclick="viewEmail('\${item.id}')" style="cursor: pointer;">
                  <span class="school-bullet-text">
                    \${dateStr ? \`<span class="date-highlight">\${dateStr}</span>\` : ''}\${title}\${personStr}
                  </span>
                  <button class="view-email-btn" onclick="event.stopPropagation(); viewEmail('\${item.id}')">View</button>
                </li>
              \`;
            }).join('');
          } catch (error) {
            console.error('Error loading school bullets:', error);
          }
        }

        // Load Activities in 3 columns - combines obligations and announcements
        async function loadActivities(personParam = '') {
          try {
            const packFilter = 'packId=activities';
            const personSuffix = personParam ? '&' + personParam.substring(1) : '';

            const [obligationsRes, announcementsRes] = await Promise.all([
              fetch(\`/api/dashboard/obligations?\${packFilter}\${personSuffix}\`),
              fetch(\`/api/dashboard/announcements?\${packFilter}\${personSuffix}\`)
            ]);
            const obligations = await obligationsRes.json();
            const announcements = await announcementsRes.json();

            // Combine and dedupe
            const seen = new Set();
            const allItems = [...obligations.items, ...announcements.items].filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            const data = { items: allItems };

            document.getElementById('activities-count').textContent = data.items.length;

            // Split into This Week, Next Week, Later
            const now = new Date();
            const thisWeekEnd = new Date(now);
            thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - thisWeekEnd.getDay())); // End of this week
            const nextWeekEnd = new Date(thisWeekEnd);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

            const thisWeek = [];
            const nextWeek = [];
            const later = [];

            data.items.forEach(item => {
              if (!item.effectiveDate) {
                later.push(item);
                return;
              }
              const eventDate = new Date(item.effectiveDate);
              if (eventDate <= thisWeekEnd) {
                thisWeek.push(item);
              } else if (eventDate <= nextWeekEnd) {
                nextWeek.push(item);
              } else {
                later.push(item);
              }
            });

            // Render each column
            renderActivityColumn('activities-thisweek', thisWeek);
            renderActivityColumn('activities-nextweek', nextWeek);
            renderActivityColumn('activities-later', later);
          } catch (error) {
            console.error('Error loading activities:', error);
          }
        }

        function renderActivityColumn(containerId, items) {
          const container = document.getElementById(containerId);
          if (items.length === 0) {
            container.innerHTML = '<div class="no-events" style="padding: 12px 0;">Nothing scheduled</div>';
            return;
          }

          container.innerHTML = items.slice(0, 5).map(item => {
            const dateStr = item.effectiveDate
              ? new Date(item.effectiveDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : '';
            return \`
              <div class="activity-entry">
                \${dateStr ? \`<div class="activity-entry-date">\${dateStr}</div>\` : ''}
                <div class="activity-entry-title">\${item.eventTitle || item.subject || 'Activity'}</div>
                \${item.person ? \`<div class="activity-entry-person">\${item.person}</div>\` : ''}
                <span class="activity-view-link" onclick="viewEmail('\${item.id}')">View email →</span>
              </div>
            \`;
          }).join('');
        }

        // Load Opportunities - show community events, school happenings, PTA meetings
        async function loadOpportunities(personParam = '') {
          try {
            // Get recent announcements for community/school events
            const response = await fetch(\`/api/dashboard/announcements\${personParam}\`);
            const data = await response.json();

            const container = document.getElementById('opportunitiesPills');

            // Show most recent announcements that are community/school related
            // Filter for events like PTA, meetings, film festivals, community events
            const opportunities = data.items.filter(item => {
              const text = (item.subject || '').toLowerCase() + (item.eventTitle || '').toLowerCase();
              return text.includes('pta') || text.includes('meeting') ||
                     text.includes('festival') || text.includes('film') ||
                     text.includes('event') || text.includes('showcase') ||
                     text.includes('performance') || text.includes('concert') ||
                     text.includes('screening') || text.includes('community') ||
                     text.includes('volunteer') || text.includes('free');
            }).slice(0, 6);

            // If no matching items, just show the most recent announcements
            const itemsToShow = opportunities.length > 0 ? opportunities : data.items.slice(0, 6);

            if (itemsToShow.length === 0) {
              container.innerHTML = '<span style="color: #64748b; font-size: 14px;">No community events right now. Check back soon!</span>';
              return;
            }

            container.innerHTML = itemsToShow.map(item => {
              const title = item.eventTitle || item.subject || 'Event';
              // Truncate long titles
              const shortTitle = title.length > 40 ? title.substring(0, 37) + '...' : title;
              const dateStr = item.effectiveDate
                ? new Date(item.effectiveDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '';
              return \`
                <div class="opportunity-pill" onclick="viewEmail('\${item.id}')" style="cursor: pointer;">
                  <span class="pill-text">\${shortTitle}</span>
                  \${dateStr ? \`<span class="pill-date">\${dateStr}</span>\` : ''}
                </div>
              \`;
            }).join('');
          } catch (error) {
            console.error('Error loading opportunities:', error);
            document.getElementById('opportunitiesPills').innerHTML =
              '<span style="color: #64748b; font-size: 14px;">No community events</span>';
          }
        }

        // Email viewer state
        let currentEmailGmailLink = null;

        // View email in modal
        async function viewEmail(itemId) {
          try {
            // Show modal immediately with loading state
            const modal = document.getElementById('emailViewerModal');
            const subjectEl = document.getElementById('emailViewerSubject');
            const fromEl = document.getElementById('emailViewerFrom');
            const dateEl = document.getElementById('emailViewerDate');
            const personContainer = document.getElementById('emailViewerPersonContainer');
            const personEl = document.getElementById('emailViewerPerson');
            const bodyEl = document.getElementById('emailViewerBody');
            const gmailBtn = document.getElementById('emailViewerGmailBtn');

            subjectEl.textContent = 'Loading...';
            fromEl.textContent = '-';
            dateEl.textContent = '-';
            personContainer.style.display = 'none';
            bodyEl.innerHTML = '<div class="email-loading">Loading email content...</div>';
            gmailBtn.style.display = 'none';
            currentEmailGmailLink = null;

            modal.classList.add('show');

            // Fetch email content
            const response = await fetch(\`/api/item/\${itemId}\`);
            const item = await response.json();

            // Update modal with email details
            subjectEl.textContent = item.subject || 'No Subject';
            fromEl.textContent = item.fromName ? \`\${item.fromName} <\${item.fromEmail || ''}>\` : item.fromEmail || 'Unknown';

            // Format date
            if (item.createdAt) {
              const date = new Date(item.createdAt);
              dateEl.textContent = date.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
            }

            // Show person if available
            if (item.person && item.person !== 'Family/Shared') {
              personEl.textContent = item.person;
              personContainer.style.display = 'flex';
            } else {
              personContainer.style.display = 'none';
            }

            // Show email body
            if (item.emailBody) {
              // Render HTML content safely
              bodyEl.innerHTML = item.emailBody;
            } else if (item.snippet) {
              bodyEl.innerHTML = \`
                <div class="email-no-content">
                  <div class="email-no-content-icon">📄</div>
                  <p style="margin-bottom: 12px;">Full email body not available</p>
                  <p style="color: var(--text-secondary); font-style: italic;">"\${escapeHtml(item.snippet)}"</p>
                </div>
              \`;
            } else {
              bodyEl.innerHTML = \`
                <div class="email-no-content">
                  <div class="email-no-content-icon">📭</div>
                  <p>No email content available</p>
                </div>
              \`;
            }

            // Set Gmail link if available
            if (item.gmailLink) {
              currentEmailGmailLink = item.gmailLink;
              gmailBtn.style.display = 'flex';
            }
          } catch (error) {
            console.error('Error viewing email:', error);
            document.getElementById('emailViewerBody').innerHTML = \`
              <div class="email-no-content">
                <div class="email-no-content-icon">❌</div>
                <p>Error loading email</p>
                <p style="color: var(--text-tertiary); font-size: 0.875rem;">Please try again later</p>
              </div>
            \`;
          }
        }

        // Close email viewer modal
        function closeEmailViewer() {
          document.getElementById('emailViewerModal').classList.remove('show');
          currentEmailGmailLink = null;
        }

        // Open current email in Gmail
        function openInGmail() {
          if (currentEmailGmailLink) {
            window.open(currentEmailGmailLink, '_blank');
          }
        }

        // Handle Escape key to close modal
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            closeEmailViewer();
            closeDismissModal();
          }
        });

        // Load tasks (for attention banner only)
        // Store current urgent item for actions
        let currentUrgentItem = null;

        async function loadTasks(personParam = '') {
          try {
            const response = await fetch(\`/api/dashboard/tasks\${personParam}\`);
            const data = await response.json();

            document.getElementById('tasks-count').textContent = data.items.length;
            document.getElementById('tasksValue').textContent = data.items.length;

            // Update urgent action banner
            const banner = document.getElementById('urgentActionBanner');
            if (data.items.length > 0) {
              currentUrgentItem = data.items[0];
              banner.classList.remove('hidden');

              // Set icon based on type
              const icon = currentUrgentItem.subject?.toLowerCase().includes('sign') ? '✍️' :
                          currentUrgentItem.subject?.toLowerCase().includes('form') ? '📝' : '⚡';
              document.getElementById('urgentIcon').textContent = icon;

              document.getElementById('urgentTitle').textContent = currentUrgentItem.subject || 'Action Required';
              document.getElementById('urgentText').textContent = currentUrgentItem.fromName
                ? \`From \${currentUrgentItem.fromName}\`
                : 'Needs your attention';
            } else {
              banner.classList.add('hidden');
              currentUrgentItem = null;
            }
          } catch (error) {
            console.error('Error loading tasks:', error);
          }
        }

        // Urgent action handlers
        async function dismissUrgentItem() {
          if (!currentUrgentItem) return;
          try {
            await fetch(\`/api/item/\${currentUrgentItem.id}/dismiss\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Dismissed from urgent banner' })
            });
            loadAllData();
          } catch (error) {
            console.error('Error dismissing item:', error);
          }
        }

        function viewUrgentItem() {
          if (!currentUrgentItem) return;
          if (currentUrgentItem.gmailLink) {
            window.open(currentUrgentItem.gmailLink, '_blank');
          } else {
            document.querySelector('.activities-section').scrollIntoView({ behavior: 'smooth' });
          }
        }


        // Dismiss modal functions
        function openDismissModal(id, type = 'obligation') {
          dismissingItemId = id;
          dismissingItemType = type;
          document.getElementById('dismissModal').classList.add('show');
          document.getElementById('dismissReason').focus();
        }

        function closeDismissModal() {
          document.getElementById('dismissModal').classList.remove('show');
          document.getElementById('dismissReason').value = '';
          dismissingItemId = null;
          dismissingItemType = null;
        }

        async function confirmDismiss() {
          const reason = document.getElementById('dismissReason').value.trim();
          if (!reason) {
            alert('Please enter a reason for dismissing this item.');
            return;
          }

          try {
            const response = await fetch(\`/api/item/\${dismissingItemId}/dismiss\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason })
            });

            if (response.ok) {
              closeDismissModal();
              loadAllData();
            } else {
              alert('Failed to dismiss item. Please try again.');
            }
          } catch (error) {
            console.error('Error dismissing item:', error);
            alert('Error dismissing item. Please try again.');
          }
        }

        // Mark task as done
        async function dismissItem(id, type) {
          try {
            const response = await fetch(\`/api/item/\${id}/dismiss\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Marked as done' })
            });

            if (response.ok) {
              loadAllData();
            }
          } catch (error) {
            console.error('Error marking item as done:', error);
          }
        }

        // Chat functions
        function toggleChat() {
          document.getElementById('chatPanel').classList.toggle('open');
        }

        async function sendChatMessage() {
          const input = document.getElementById('chatInput');
          const message = input.value.trim();
          if (!message) return;

          const messages = document.getElementById('chatMessages');
          const sendBtn = document.getElementById('chatSend');

          // Add user message
          messages.innerHTML += \`<div class="chat-message user">\${escapeHtml(message)}</div>\`;
          input.value = '';
          input.disabled = true;
          sendBtn.disabled = true;
          messages.scrollTop = messages.scrollHeight;

          try {
            const response = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (data.response) {
              messages.innerHTML += \`<div class="chat-message assistant">\${escapeHtml(data.response)}</div>\`;
            } else if (data.error) {
              messages.innerHTML += \`<div class="chat-message assistant" style="color: #ef4444;">Error: \${escapeHtml(data.error)}</div>\`;
            }
          } catch (error) {
            messages.innerHTML += \`<div class="chat-message assistant" style="color: #ef4444;">Failed to send message. Please try again.</div>\`;
          }

          input.disabled = false;
          sendBtn.disabled = false;
          input.focus();
          messages.scrollTop = messages.scrollHeight;
        }

        function escapeHtml(text) {
          const div = document.createElement('div');
          div.textContent = text;
          return div.innerHTML;
        }

        // Update kid badges with action counts
        async function updateKidBadges() {
          const kids = ${JSON.stringify(kids)};

          for (const kid of kids) {
            try {
              const response = await fetch(\`/api/dashboard/tasks?person=\${encodeURIComponent(kid)}\`);
              const data = await response.json();

              const card = document.querySelector(\`.kid-card[data-person="\${kid}"]\`);
              if (card) {
                const badge = card.querySelector('.kid-badge');
                const subtitle = card.querySelector('.kid-subtitle');

                if (data.items.length > 0) {
                  badge.textContent = data.items.length;
                  badge.style.display = 'block';
                } else {
                  badge.style.display = 'none';
                }

                // Update subtitle with total updates
                const updatesRes = await fetch(\`/api/dashboard/updates?person=\${encodeURIComponent(kid)}\`);
                const updatesData = await updatesRes.json();
                subtitle.textContent = \`\${updatesData.items.length} updates\`;
              }
            } catch (error) {
              console.error(\`Error updating badge for \${kid}:\`, error);
            }
          }
        }

        // Initial load
        loadAllData();
        updateKidBadges();

        // Refresh every 60 seconds
        setInterval(() => {
          loadAllData();
          updateKidBadges();
        }, 60000);
      </script>
    </body>
    </html>
  `;
}
