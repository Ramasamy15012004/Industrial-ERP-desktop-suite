// Help.jsx
import React, { useState, useEffect } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";

const HELP_MOBILE_BREAKPOINT = 768;
const TRIAL_INFO_API = "http://localhost:8000/license/trial-info";

const ProductionManual = () => {
  const [activeSection, setActiveSection] = useState("intro");
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= HELP_MOBILE_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > HELP_MOBILE_BREAKPOINT);
  const [trialInfo, setTrialInfo] = useState(null);
  const [trialInfoLoading, setTrialInfoLoading] = useState(true);
  const [trialInfoError, setTrialInfoError] = useState("");

  // Handle hash fragment on load and when it changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1); // Remove the #
      if (hash) {
        // Extract main section ID (before any dash)
        const mainSectionId = hash.split('-')[0];
        setActiveSection(mainSectionId);
        
        // Scroll to the element with the hash ID
        setTimeout(() => {
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      }
    };

    // Handle initial load
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= HELP_MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchTrialInfo = async () => {
      setTrialInfoLoading(true);
      setTrialInfoError("");

      try {
        const res = await fetch(TRIAL_INFO_API);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message =
            body?.message ||
            body?.detail ||
            (body?.code ? String(body.code) : "") ||
            `HTTP ${res.status}`;
          throw new Error(message);
        }

        const data = await res.json();
        if (!cancelled) {
          setTrialInfo(data);
        }
      } catch (err) {
        console.error("Failed to fetch trial info:", err);
        if (!cancelled) {
          setTrialInfo(null);
          setTrialInfoError("Unable to load trial information");
        }
      } finally {
        if (!cancelled) {
          setTrialInfoLoading(false);
        }
      }
    };

    fetchTrialInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  const sections = [
    { id: "intro", title: "1. INTRODUCTION" },
    { id: "dashboard", title: "2. DASHBOARD" },
    { id: "inventory", title: "3. INVENTORY" },
    { id: "jobs", title: "4. JOBS & PRODUCTION" },
    { id: "reports", title: "5. REPORTS" },
    { id: "settings", title: "6. SETTINGS" },
    { id: "auth", title: "7. AUTHENTICATION" }
  ];

  return (
    <div className="help-manual" style={styles.app}>
      {isMobile && sidebarOpen && (
        <div className="blur-overlay" style={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
      )}

      {isMobile && (
        <button
          type="button"
          style={styles.sidebarToggle}
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? "Close index" : "Open index"}
          title="Index"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      )}
      {/* SIDEBAR */}
      <div
        style={{
          ...styles.sidebar,
          width: 280,
          transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          position: isMobile ? 'fixed' : 'relative',
          left: isMobile ? 0 : undefined,
          top: isMobile ? 0 : undefined,
          bottom: isMobile ? 0 : undefined,
          zIndex: isMobile ? 50 : undefined,
        }}
      >
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>📋 INDEX</h2>
        </div>
        <nav style={styles.sidebarNav}>
          {sections.map(section => (
            <button
              key={section.id}
              style={{
                ...styles.navItem,
                background: activeSection === section.id ? '#2b5270' : 'transparent',
                borderLeft: activeSection === section.id ? '4px solid #4ecdc4' : '4px solid transparent'
              }}
              onClick={() => {
                setActiveSection(section.id);
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                if (isMobile) setSidebarOpen(false);
              }}
            >
              {section.title}
            </button>
          ))}
        </nav>
        <div style={styles.sidebarFooter}>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div
        className="help-manual-main"
        style={{ ...styles.mainContent, paddingTop: isMobile ? '72px' : undefined }}
      >
        {/* Trial info + Back */}
        <div style={styles.topBar}>
          {/* <div style={styles.trialBanner}>
            <div style={styles.trialHeadline}>
              Trial Version — This software is running in {(trialInfo?.trial_days_total ?? 14)}-day evaluation mode
            </div>

            {trialInfoLoading ? (
              <div style={styles.trialMeta}>
                <div>
                  <span style={styles.trialMetaLabel}>Remaining days:</span> ...
                </div>
                <div>
                  <span style={styles.trialMetaLabel}>Expiry Date:</span> ...
                </div>
              </div>
            ) : trialInfo ? (
              <div style={styles.trialMeta}>
                <div>
                  <span style={styles.trialMetaLabel}>Remaining days:</span> {trialInfo.remaining_days}
                </div>
                <div>
                  <span style={styles.trialMetaLabel}>Expiry Date:</span> {trialInfo.expiry_date_human}
                </div>
              </div>
            ) : (
              <div style={styles.trialMetaMuted}>{trialInfoError || "Trial information unavailable."}</div>
            )}
          </div> */}

          <div style={styles.backButtonContainer}>
            <button
              type="button"
              style={styles.backButton}
              onClick={() => window.history.back()}
            >
              <ArrowLeft size={16} />
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* COVER PAGE */}
        <div style={styles.coverPage}>
          <h1 style={styles.coverTitle}>MANUFACTURING PRODUCTION & INVENTORY CONTROL SYSTEM</h1>
          <div style={styles.coverBadges}></div>
        </div>

        <div style={styles.trialBanner}>
            <div style={styles.trialHeadline}>
              Demo Version — This software is running in unlimited evaluation mode
            </div>
            <div style={styles.trialMeta}>
              <div>
                <span style={styles.trialMetaLabel}>Status:</span> Fully Unlocked (Demo Model)
              </div>
              <div>
                <span style={styles.trialMetaLabel}>Remaining days:</span> Unlimited
              </div>
            </div>
          </div>

        {/* SECTION 1: INTRODUCTION */}
        <section id="intro" style={styles.section}>
          <h2 style={styles.h2}>1. INTRODUCTION</h2>
          
          <div style={styles.card}>
            <h3 style={styles.h3}>1.1 What This System Does</h3>
            <p style={styles.text}>
              This is a comprehensive Production Planning and Inventory Control System designed to provide end-to-end visibility and management of manufacturing operations. The system integrates real-time data from the factory floor and inventory to help businesses plan production, track job progress, manage material stocks, and make data-driven decisions. It bridges the gap between production targets and material availability, ensuring efficient workflow and on-time delivery.
            </p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.h3}>1.2 System Overview</h3>
            <p style={styles.text}>
              This is a comprehensive Production Planning and Inventory Control System designed to provide end-to-end visibility and management of manufacturing operations. The system integrates real-time data from the factory floor and inventory to help businesses plan production, track job progress, manage material stocks, and make data-driven decisions. It bridges the gap between production targets and material availability, ensuring efficient workflow and on-time delivery.
            </p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.h3}>1.3 Target Users</h3>
            <ul style={styles.ul}>
              <li><strong>Production Managers:</strong> To monitor shop floor activity, track job progress, identify bottlenecks, and manage capacity.</li>
              <li><strong>Inventory/Store Managers:</strong> To track stock levels, manage material inward/outward, identify shortages, and plan purchases.</li>
              <li><strong>Business Owners/Decision Makers:</strong> To get a high-level overview of performance via dashboards, monitor KPIs, and ensure customer satisfaction by reducing delays.</li>
              <li><strong>Production Planners:</strong> To create new jobs, define Bill of Materials, and schedule production based on material availability and deadlines.</li>
            </ul>
          </div>

          <div style={styles.card}>
            <h3 style={styles.h3}>1.4 Key Features</h3>
            <ul style={styles.ul}>
              <li><strong>Product Management:</strong> Define products and Bill of Materials</li>
              <li><strong>Job Management:</strong> Create and track production jobs</li>
              <li><strong>Material Reservation:</strong> Automatic stock allocation during job creation</li>
              <li><strong>Production Tracking:</strong> Record shift-wise output with rejections</li>
              <li><strong>Inventory Control:</strong> Manage stock transactions and minimum levels</li>
              <li><strong>Dashboard & Reports:</strong> KPI monitoring and analytics</li>
              <li><strong>Authentication & User Management:</strong> Role-based login with Admin, Planner, Store, and Operator roles</li>
            </ul>
          </div>
        </section>

        {/* SECTION 2: DASHBOARD */}
        <section id="dashboard" style={styles.section}>
          <h2 style={styles.h2}>2. DASHBOARD</h2>

          <div style={styles.card}>
            <h3 style={styles.h3}>2.1 What is a Dashboard?</h3>
            <p style={styles.bodyText}>User interface that organizes and presents critical, real-time data, key performance indicators (KPIs), and metrics on a single screen</p>
            <p style={styles.bodyText}>It shows:</p>
            <ul style={styles.discList}>
              <li>Monthly Production</li>
              <li>Total Active Jobs</li>
              <li>Job progress</li>
              <li>Capacity Utilization</li>
              <li>Delayed Jobs</li>
            </ul>
          </div>

          <div style={styles.card}>
            <h3 style={styles.h3}>2.2 📊 What Each Section Means</h3>
            
            <div style={styles.sectionItem}>
              <h4 style={styles.h4}>1️⃣ Monthly Production</h4>
              <p style={styles.bodyText}>Total quantity produced this month.</p>
              <ul style={styles.discList}>
                <li> Used to track monthly performance</li>
                <li> Compare with previous months</li>
              </ul>
            </div>

            <div style={styles.sectionItem}>
              <h4 style={styles.h4}>2️⃣ Total Active Jobs</h4>
              <p style={styles.bodyText}>Number of jobs currently running in production.</p>
              <ul style={styles.discList}>
                <li> Helps monitor workload</li>
                <li> Check how many jobs are ongoing</li>
              </ul>
            </div>

            <div style={styles.sectionItem}>
              <h4 style={styles.h4}>3️⃣ WIP Quantity</h4>
              <p style={styles.bodyText}>WIP = Work In Progress</p>
              <p style={styles.bodyText}>Total items that are started but not finished.</p>
              <ul style={styles.discList}>
                <li> Helps track unfinished production</li>
                <li> Important for production planning</li>
              </ul>
            </div>

            <div style={styles.sectionItem}>
              <h4 style={styles.h4}>4️⃣ Capacity Utilization</h4>
              <p style={styles.bodyText}>How much of your factory capacity is being used.</p>
              <p style={styles.bodyText}>Formula:</p>
              <p style={styles.bodyText}>Capacity Utilization = (Actual Production / Maximum Capacity) × 100</p>
              <ul style={styles.discList}>
                <li> Helps check efficiency</li>
                <li> If low → Increase jobs</li>
                <li> If high → Avoid overload</li>
              </ul>
            </div>

            <div style={styles.sectionItem}>
              <h4 style={styles.h4}>5️⃣ Delayed Jobs</h4>
              <p style={styles.bodyText}>Number of jobs that passed their deadline but are not completed.</p>
              <ul style={styles.discList}>
                <li>⚠ Important for management</li>
                <li>⚠ Prevent customer complaints</li>
              </ul>
            </div>
          </div> 

          {/* Today's Plan Subsection */}
          <div id="dashboard-todays-plan">
            <div style={styles.card}>
              <h3 style={styles.h3}>2.3 🗂 Today's Plan</h3>

              <div style={styles.sectionItem}>
                <h4 style={styles.h4}>🔹 Today's Plan</h4>

                <p style={styles.bodyText}>
                  The Today's Plan section displays all production quantities scheduled specifically for the current date. 
                  It helps users quickly understand what needs to be manufactured today and ensures smooth daily execution.
                </p>

                <p style={styles.bodyText}>This section helps production teams:</p>

                <ul style={styles.discList}>
                  <li>Know which jobs must be worked on today</li>
                  <li>Track daily production targets</li>
                  <li>Avoid missing deadlines</li>
                  <li>Monitor remaining balance after today's work</li>
                  <li>Ensure proper utilization of resources</li>
                </ul>

                <p style={styles.bodyText}>
                  By focusing only on today's scheduled quantities, the Today's Plan module improves daily production control, 
                  execution accuracy, and operational efficiency.
                </p>
              </div>
            </div>
          </div>

          {/* Remarks Subsection */}
          <div id="dashboard-remarks">
            <div style={styles.card}>
              <h3 style={styles.h3}>2.4 🔔 Remarks</h3>
              
              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#161616'}}>1️⃣ High Risk</h4>
                <p style={styles.bodyText}>Find jobs that are "Partially Reserved" and have deadline within 6 days.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID - Material shortage + near deadline</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#0a0a0a'}}>2️⃣ Production Behind</h4>
                <p style={styles.bodyText}>Calculate if production pace is too slow (required rate  130% of expected rate).</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID - Production behind pace</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#070707'}}>3️⃣ Capacity Risk</h4>
                <p style={styles.bodyText}>Count jobs with "In Progress" status, warn if greater than 4.</p>
                <p style={styles.bodyText}><strong>Recommendation: Too many jobs in progress (5)</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#1b1b1b'}}>4️⃣ Delay</h4>
                <p style={styles.bodyText}>Check if completed jobs finished after target date.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID completed late</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#0c0c0c'}}>5️⃣ Quality Issue</h4>
                <p style={styles.bodyText}>Calculate rejection rate per job, warn if ≥ 40%.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID rejection above 40%</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#050505'}}>6️⃣ Critical Deadline</h4>
                <p style={styles.bodyText}>Find jobs that are "Reserved" but not started, with deadline within 4 days.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID not started - deadline in 1 days</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#030303'}}>7️⃣ Deadline Pressure</h4>
                <p style={styles.bodyText}>Find active jobs with very tight deadlines.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID in progress - only 1 days left</strong></p>
              </div>

              <div style={styles.recommendationItem}>
                <h4 style={{...styles.h4, color: '#0a0a0a'}}>8️⃣ Overproduction</h4>
                <p style={styles.bodyText}>Check if finished quantity exceeds planned quantity.</p>
                <p style={styles.bodyText}><strong>Recommendation: JOB ID exceeded plan by 10 units</strong></p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: INVENTORY MANAGEMENT */}
        <section id="inventory" style={styles.section}>
          <h2 style={styles.h2}>3. INVENTORY MANAGEMENT</h2>
          
          <div style={styles.card}>
            <h3 style={styles.h3}>What is Inventory Management?</h3>
            <p style={styles.bodyText}>Inventory Management is the process of tracking controlling, 
              and optimizing the materials, components, and finished goods used in a business.</p>
          </div>

          {/* Inventory Dashboard Overview */}
          <div id="inventory-dashboard">
            <div style={styles.card}>
              <h3 style={styles.h3}>3.1 📊 INVENTORY DASHBOARD</h3>
              <p style={styles.bodyText}>This is the overview screen of inventory.</p>
              <p style={styles.bodyText}>It gives real-time visibility of:</p>
            <ul style={styles.discList}>
              <li>Stock Movement Timelin</li>
              <li>Latest Transactions</li>
              <li>Critical Materials</li>
              <li>Jobs At Risk</li>
            </ul>
            <p style={styles.bodyText}>Managers use this screen daily.</p>
            </div>
          </div>

          {/* Stock Movement Timeline Subsection */}
          <div id="inventory-stock-timeline">
            <div style={styles.card}>
              <h3 style={styles.h3}>📈 Stock Movement Graph</h3>
              <ul style={styles.discList}>
              <li>Purchase line(tracks all inward transactions such as purchase receipts, returns, and manual adjustments that increase stock) </li>
              <li>Issued line ( tracks all outward transactions such as material issues to production jobs, reservations, and consumption that decrease stock) </li>
              <li>X-Axis (Time) – Shows the date or time period.Y-Axis (Quantity) – Shows the stock quantity.</li>
            </ul>
          </div>
          </div>

          {/* Latest Transactions Subsection */}
          <div id="inventory-latest-transactions">
            <div style={styles.card}>
              <h3 style={styles.h3}>🧾 Latest Transactions</h3>
              <p style={styles.bodyText}>This shows the most 20recent stock activities.</p>
            </div>
          </div>

          {/* Critical Materials Subsection */}
          <div id="inventory-critical-materials">
            <div style={styles.card}>
              <h3 style={styles.h3}>🚨 Critical Materials</h3>
              <p style={styles.bodyText}>This section shows materials that are below minimum stock level.</p>
              
              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Table Columns:</p>
                <ul style={styles.discList}>
                  <li>Minimum required stock</li>
              <li>Current stock</li>
              <li>Suggested reorder quantity</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Jobs At Risk Subsection */}
          <div id="inventory-jobs-at-risk">
            <div style={styles.card}>
              <h3 style={styles.h3}>⚠ Jobs At Risk</h3>
              <p style={styles.bodyText}>This shows production jobs that may stop due to material shortage..</p>
              
              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Table Columns:</p>
                <ul style={styles.discList}>
                 <li>Required material quantity</li>
                 <li>Available stock</li>
                 <li>Shortage amount</li>
            </ul>
              </div>

            
            </div>
          </div>

          {/* 3.2 VIEW STOCK */}
          <div id="inventory-view-stock">
            <div style={styles.card}>
              <h3 style={styles.h3}>3.2 🔍 VIEW STOCK</h3>
              <p style={styles.bodyText}>View Stock is used to.</p>
            <ul style={styles.discList}>
              <li>See current stock status of all materials</li>
              <li>Identify shortages</li>
              <li>Monitor minimum levels</li>
              <li>Support purchase decisions</li>
              <li>Support production planning</li>
            </ul>
            <p style={styles.bodyText}>It gives a complete material-wise visibility.</p>
            </div>
          </div>

          {/* LOW STOCK MATERIALS */}
          <div id="inventory-low-stock">
            <div style={styles.card}>
              <h3 style={styles.h3}>MRP Purchase List</h3>
              <p style={styles.bodyText}>The MRP Purchase List table highlights all materials whose available stock has reached or fallen below the defined Minimum Stock Level.</p>
              <p style={styles.bodyText}>
This section acts as an early warning system to:
</p>

<ul style={styles.discList}>
  <li>Prevent production delays</li>
  <li>Avoid emergency purchasing</li>
  <li>Maintain smooth manufacturing flow</li>
  <li>Support proactive inventory planning</li>
</ul>

<p style={styles.bodyText}>
It allows store managers and production planners to immediately identify critical materials that require replenishment before they impact active jobs.
</p>

              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>⚠ Job Shortage</p>
                <p style={styles.fieldText}>Job Shortage represents the total quantity of a material that is.</p>
                 <ul style={styles.discList}>
    <li>Required for currently active production jobs</li>
    <li>Not available in usable stock</li>
  </ul>
  <p style={styles.fieldText}>
    It indicates how much material is missing to fully support running production schedules.
  </p>
  <p style={styles.fieldText}>
    If Job Shortage exists, production may slow down or stop unless corrective action is taken.
  </p>
              </div>

              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>🛒 Suggested Purchase Quantity</p>
                <p style={styles.fieldText}>The Suggested Purchase Qty is the quantity the system recommends purchasing immediately.</p>
                 <p style={styles.fieldText}>
    This value is calculated to:
  </p>
  <ul style={styles.discList}>
    <li>Meet the defined Minimum Stock Level</li>
    <li>Cover current Job Shortage</li>
    <li>Ensure buffer stock for operational stability</li>
  </ul>
  <p style={styles.fieldText}>
    This helps planners make quick, data-driven purchasing decisions.
  </p>
              </div>

              <h3 style={styles.h3}>📊 Material Requirements Planning (MRP)</h3>
              <p style={styles.bodyText}>The system includes integrated Material Requirements Planning (MRP) capabilities to ensure materials are available exactly when needed for production.</p>
              <p style={styles.bodyText}>MRP automatically calculates material demand based on:</p>
              <ul style={styles.discList}>
  <li>Bill of Materials (BOM)</li>
  <li>Active Production Jobs</li>
  <li>Current Stock Availability</li>
  <li>Reserved Quantities</li>
</ul>  
     
            </div>
          </div>

          {/* STOCK TRANSACTIONS HISTORY */}
          <div id="inventory-transactions-history">
            <div style={styles.card}>
              <h3 style={styles.h3}>📜 STOCK TRANSACTIONS HISTORY</h3>
              <p style={styles.bodyText}>This section provides full stock movement history.</p>
              <ul style={styles.discList}>
              <li>Tracking material inflow and outflow</li>
              <li>Verifying stock changes</li>
              <li>Auditing transactions</li>
              <li>Monitoring job-wise material usage</li>
              <li>Investigating stock discrepancies</li>
              <li>transaction overall history  show</li>
            </ul>
                 <div style={styles.fieldGroup}>
              <p style={styles.fieldLabel}>Type</p>
               <li><strong>OPENING</strong> – Starting stock entered when the material is first added.</li>
    <li><strong>PURCHASE</strong> – Stock added from a supplier.</li>
    <li><strong>RESERVED</strong> – Stock kept aside for a job (not used yet, but not available).</li>
    <li><strong>MATERIAL ISSUE</strong> – Stock sent to production and reduced from inventory.</li>
</div>  
            </div>
          </div>
 {/* 3.3 PURCHASE ENTRY - WITH INWARD AND OUTWARD SUBSECTIONS */}
  <div id="inventory-purchase-entry">
    <div style={styles.card}>
      <h3 style={styles.h3}>3.3 📥 PURCHASE ENTRY</h3>
      <p style={styles.bodyText}>Purchase Entry is the process of recording materials received from a supplier into the inventory system.</p>      
      
      {/* INWARD SUBSECTION - WITH SPECIFIC ID */}
      <div id="inventory-inward">
        <div style={styles.fieldGroup}>
          <p style={styles.fieldLabel}>Inward</p>
          <p style={styles.fieldText}>The Inventory Inward Form is used to record incoming materials by entering the purchase date, selecting the material code, confirming the material name, entering the quantity, choosing the transaction type (usually purchase), and saving the entry to update stock immediately</p>        </div>
      </div>
      
      {/* OUTWARD SUBSECTION - WITH SPECIFIC ID */}
      <div id="inventory-outward">
        <div style={styles.fieldGroup}>
          <p style={styles.fieldLabel}>Outward</p>
          <p style={styles.bodyText}>This section shows all production jobs that have materials reserved and are waiting to be issued to production.</p>
          <p style={styles.fieldText}> "Material issued successfully".</p>
        </div>
      </div>
    </div>
  </div>


          {/* 3.4 MATERIAL MASTER - WITH ID */}
          <div id="inventory-material-master">
            <div style={styles.card}>
              <h3 style={styles.h3}>3.4 📦 MATERIAL MASTER</h3>
              <p style={styles.bodyText}>Material Master is the main control table for all materials in your system.</p>
              <p style={styles.bodyText}>The Material Master is used to create and manage materials by adding a code, name, and minimum stock level for use in the system.</p>
            </div>
          </div>
        </section>

        {/* SECTION 4: JOBS & PRODUCTION MANAGEMENT */}
        <section id="jobs" style={styles.section}>
          <h2 style={styles.h2}>4. 🏭 JOBS & PRODUCTION MANAGEMENT</h2>
          
          <div style={styles.card}>
            <p style={styles.text}>This module is used to:</p>
            <ul style={styles.discList}>
              <li>Plan production</li>
              <li>Track job progress</li>
              <li>Record daily output</li>
              <li>Monitor balance quantity</li>
              <li>Control completion status</li>
            </ul>
            <p style={styles.text}>It connects production with inventory and dashboard.</p>
          </div>

          {/* 4.1 ACTIVE JOBS */}
          <div id="jobs-active-jobs">
            <div style={styles.card}>
              <h3 style={styles.h3}>4.1 🔵 JOB DETAILS</h3>
              <p style={styles.fieldLabel}>Active Jobs (Priority Wise Ordered)</p>

              <p style={styles.text}>
                The Job Details section provides a structured, day-by-day priority view of all active production jobs in the system. It helps users monitor production progress, track remaining balances, and manage planning activities efficiently.
              </p>

              <p style={styles.text}>
                Each job record displays essential information including Job ID, Job Date, Product ID, Product Name, Planned Quantity, Finished Quantity, Target Date, Start Date, Balance Quantity, and Current Status.
              </p>

              <p style={styles.text}>
                Jobs are automatically arranged based on priority logic, ensuring that critical or time-sensitive jobs appear first. Status indicators such as In Progress and Partially Reserved visually represent the current state of each job.
              </p>

              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Production Plan Module</p>
                <p style={styles.fieldText}>
                  Users can open a specific job to access the Production Plan module. This module allows scheduling production quantities on selected dates while tracking remaining balance and future commitments.
                </p>
              </div>

              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Production Plan Fields</p>
                <p style={styles.fieldText}>
                  <strong>Plan Date</strong> – The scheduled production date<br />
                  <strong>Plan Quantity</strong> – Quantity planned for that date<br />
                  <strong>Available</strong> – Remaining quantity after accounting for already planned future quantities<br />
                  <strong>Balance</strong> – Balance shows the total quantity that is still not produced for the job<br />
                  <strong>Save Plan</strong> – Saves the new production schedule<br />
                  <strong>Future Plans</strong> – Displays all previously scheduled production entries and allows editing
                </p>
              </div>

              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Future Plans Overview</p>
                <p style={styles.fieldText}>
                  The Future Plans window provides a clear historical and upcoming schedule view, showing plan dates and planned quantities. This helps ensure proper production distribution and prevents over-planning.
                </p>
              </div>

              <p style={styles.text}>
                Overall, the Job Details module ensures controlled production scheduling, real-time monitoring, and better decision-making in manufacturing operations.
              </p> 
            </div>
          </div>

          {/* 4.2 PRODUCTION ENTRY - WITH ID */}
          <div id="jobs-production-entry">
            <div style={styles.card}>
              <h3 style={styles.h3}>4.2 🏗 PRODUCTION ENTRY</h3>
              <p style={styles.text}>Production Entry is used to record actual production output for a job. It tracks how many units were produced and how many were rejected during each shift.</p>
              
              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Production Entry</p>
                <p style={styles.fieldText}>The Production Entry Form is used to select a job and shift, enter finished and rejected quantities, add optional remarks, and save the entry to update job progress.</p>
              </div>
            </div>
          </div>

          {/* 4.3 COMPLETED JOBS - WITH ID */}
          <div id="jobs-completed-jobs">
            <div style={styles.card}>
              <h3 style={styles.h3}>4.3 ✅ COMPLETED JOBS</h3>
              <p style={styles.text}>Completed Jobs shows jobs that are fully finished.</p>
              <div style={styles.fieldGroup}>
                <p style={styles.fieldLabel}>Completed Jobs</p>
                <p style={styles.fieldText}>Completed Jobs shows all finished production jobs with their job details, planned and finished quantities, completion date, and final status for record and performance tracking.</p>
              </div>
            </div>
          </div>

          {/* 4.4 CREATE NEW JOB - WITH ID */}
          <div id="jobs-create-job">
            <div style={styles.card}>
              <h3 style={styles.h3}>4.4 ➕ CREATE NEW JOB</h3>
              <p style={styles.text}>Create New Job is used to plan new production.</p>
              <p style={styles.fieldLabel}>NEW JOB</p>
              <div style={styles.fieldGroup}>
                <p style={styles.text}>Select a product to manufacture (the product name fills automatically), enter the total quantity to produce, and set the target completion date for finishing the job.</p>
              </div>
              
              <p style={styles.fieldLabel}>🔄 Complete Production Flow</p>
              <div style={styles.flowBox}>
                <p>
                  Product Setup → Material Setup → Purchase Entry → Create Job → Reserve Materials → Plan Production → Execute Today's Plan → Record Production Entry → Complete Job → Monitor Dashboard → Analyze Reports
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: REPORTS */}
        <section id="reports" style={styles.section}>
          <h2 style={styles.h2}>5. 📋 REPORTS</h2>
          
          <div style={styles.card}> 
            <h3 style={styles.text}>Report</h3>
            <p style={styles.text}>A report shows important information in an organized way so management can understand performance and take action.</p>
          </div>

          <div style={styles.card}>
            <h3 style={styles.h3}>Select Report Type</h3>
            
            <div style={styles.reportList}>
              {/* Production Summary */}
              <div style={styles.reportItem}>
                <div style={styles.reportContent}>
                  <h4 style={styles.reportTitle}>📊 Production Summary</h4>
                  <p style={styles.reportDesc}>Shift-wise output, rejections and efficiency per job.</p>
                </div>
              </div>
              
              {/* Job Performance */}
              <div style={styles.reportItem}>
                <div style={styles.reportContent}>
                  <h4 style={styles.reportTitle}>⚙️ Job Performance</h4>
                  <p style={styles.reportDesc}>Planned vs actual, lead-time and on-time delivery.</p>
                </div>
              </div>
              
              {/* Inventory Stock */}
              <div style={styles.reportItem}>
                <div style={styles.reportContent}>
                  <h4 style={styles.reportTitle}>📦 Inventory Stock</h4>
                  <p style={styles.reportDesc}>Current stock & shortage levels.</p>
                </div>
              </div>
              
              {/* Material Consumption */}
              <div style={styles.reportItem}>
                <div style={styles.reportContent}>
                  <h4 style={styles.reportTitle}>🧾 Material Consumption</h4>
                  <p style={styles.reportDesc}>Material issue and consumption per job.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: SETTINGS */}
        <section id="settings" style={styles.section}>
          <h2 style={styles.h2}>6. ⚙ SETTINGS</h2>
          
          {/* SETTINGS OVERVIEW */}
          <div id="settings-overview">
            <div style={styles.card}>
              <h3 style={styles.h3}>⚙ SETTINGS → PRODUCTS</h3>
              <p style={styles.text}>This section is used to:</p>
              <ul style={styles.discList}>
                <li>Create products</li>
                <li>Define required materials</li>
                <li>Set material quantities per product</li>
                <li>Control production material planning</li>
              </ul>
              <p style={styles.text}>Products must be defined here before creating jobs.</p>
            </div>
          </div>

          {/* PRODUCTS TABLE */}
          <div id="settings-products-table">
            <div style={styles.card}>
              <h3 style={styles.h3}>📋 PRODUCTS TABLE</h3>

              <p style={styles.text}>
                PRODUCTS TABLE – Contains all manufactured product details.
              </p>

              <p style={styles.text}>
                <strong>Product ID</strong> – Unique identifier for each product. Must be unique. Used in Jobs, Production, and Reports. Acts as the system reference key.
              </p>

              <p style={styles.text}>
                <strong>Product Name</strong> – Name of the manufactured product. Used for display. Visible in Jobs and Dashboard. Helps clearly identify the product.
              </p>

              <p style={styles.text}>
                <strong>Materials</strong> – Shows the number of materials linked to the product. Indicates whether BOM is defined. If no materials are linked, production cannot calculate material requirements.
              </p>

              <p style={styles.text}>
                <strong>Action</strong> – Includes Edit, Delete, and View BOM options. Edit modifies product or BOM. Delete removes unused product. View displays the material list.
              </p>
            </div>
          </div>

          {/* PRODUCT MASTER */}
          <div id="settings-product-master">
            <div style={styles.card}>
              <h3 style={styles.h3}>🏗 PRODUCT MASTER</h3>
              <p style={styles.text}><strong>Product Master</strong> is where product details and BOM are created. It contains: Product ID, Product Name, and BOM Setup. This is the main configuration area of the system.</p>
            </div>
          </div>

          {/* BOM SETUP - WITH ID */}
          <div id="settings-bom-setup">
            <div style={styles.card}>
              <h3 style={styles.h3}>📦 BOM SETUP (Bill of Materials)</h3>
              <p style={styles.text}><strong>BOM SETUP</strong> (Bill of Materials) – Defines the materials required to manufacture one unit of a product. BOM defines which materials are required to produce one unit of the product.</p>
              <p style={styles.text}>Fields in BOM: Material – Select material from the Material Master. Quantity – Specify the amount of material required per unit of product. This defines the production material consumption logic.</p>
            </div>
          </div>

          {/* USER MANAGEMENT - WITH ID */}
          <div id="settings-user-management">
            <div style={styles.card}>
              <h3 style={styles.h3}>👥 USER MANAGEMENT</h3>
              <p style={styles.bodyText}>The User Management page allows Admins to create, edit, and manage user accounts. Only users with the <strong>Admin</strong> role can access this section.</p>
              <p style={styles.bodyText}>Navigate to: <strong>Settings → User Management</strong></p>

              <div style={styles.sectionItem}>
                <h4 style={styles.h4}>➕ Create User</h4>
                <p style={styles.bodyText}>To create a new user, fill in the following fields and click <strong>Create User</strong>:</p>
                <ul style={styles.discList}>
                  <li><strong>Username</strong> – Unique login name (lowercase, no spaces). Cannot be changed after creation.</li>
                  <li><strong>Full Name</strong> – Optional display name for the user.</li>
                  <li><strong>Role</strong> – Select one of four roles: Admin, Production Planner, Store / Inventory Manager, or Production Operator.</li>
                  <li><strong>Password</strong> – Set the initial login password.</li>
                </ul>
              </div>

              <div style={styles.sectionItem}>
                <h4 style={styles.h4}>📋 Users Table</h4>
                <p style={styles.bodyText}>The Users table displays all existing accounts with inline editing:</p>
                <ul style={styles.discList}>
                  <li><strong>Full Name</strong> – Edit directly in the table row.</li>
                  <li><strong>Role</strong> – Change using the dropdown selector.</li>
                  <li><strong>Active</strong> – Toggle checkbox to enable/disable. Deactivating a user immediately revokes all active sessions.</li>
                  <li><strong>Save</strong> – Apply changes (enabled only when modifications are detected).</li>
                  <li><strong>Reset Password</strong> – Set a new password and revoke all existing sessions for that user.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: AUTHENTICATION & LOGIN */}
        <section id="auth" style={styles.section}>
          <h2 style={styles.h2}>7. 🔐 AUTHENTICATION & LOGIN</h2>
          
          <div style={styles.card}>
            <h3 style={styles.h3}>7.1 Login Screen</h3>
            <p style={styles.bodyText}>
              The system uses secure token-based authentication. Every user must log in with valid credentials before accessing any feature.
            </p>
            <p style={styles.bodyText}>
              When the application starts, users are presented with a login screen. Enter your <strong>Username</strong> and <strong>Password</strong>, then click <strong>Login</strong>. On successful authentication, the system issues a session token and redirects to the Dashboard.
            </p>
            <div style={styles.note}>
              <strong>🔒 Security:</strong> Passwords are securely hashed using PBKDF2-SHA256 with a unique salt per user. Plain-text passwords are never stored.
            </div>
          </div>

          {/* ROLES & PERMISSIONS */}
          <div id="auth-roles">
            <div style={styles.card}>
              <h3 style={styles.h3}>7.2 🛡 User Roles & Permissions</h3>
              <p style={styles.bodyText}>
                The system enforces Role-Based Access Control (RBAC). Each user is assigned one of four roles that determine which modules and actions they can access:
              </p>

              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Access Level</th>
                    <th style={styles.th}>Key Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>Admin</td>
                    <td style={styles.td}>Full Access</td>
                    <td style={styles.td}>All modules, Settings, Products, User Management, Cancel Jobs</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>Planner</td>
                    <td style={styles.td}>Production Planning</td>
                    <td style={styles.td}>Create Jobs, Production Plan, Daily Plan, Reports (Production), View Dashboard</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>Store</td>
                    <td style={styles.td}>Inventory Management</td>
                    <td style={styles.td}>Material Master, Purchase Entry (Inward/Outward), Issue Material, Stock Reports, View Dashboard</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>Operator</td>
                    <td style={styles.td}>Production Floor</td>
                    <td style={styles.td}>Production Entry (record shift output), View In-Progress Jobs, View Dashboard</td>
                  </tr>
                </tbody>
              </table>

              <div style={{...styles.note, marginTop: '15px'}}>
                <strong>ℹ Note:</strong> Admin users have unrestricted access to all modules regardless of specific role permissions.
              </div>
            </div>
          </div>

          {/* DEFAULT USERS */}
          <div id="auth-default-users">
            <div style={styles.card}>
              <h3 style={styles.h3}>7.3 👤 Default Users</h3>
              <p style={styles.bodyText}>
                The system is pre-configured with four default user accounts for immediate use after installation:
              </p>

              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Username</th>
                    <th style={styles.th}>Default Password</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>admin</td>
                    <td style={styles.td}>admin</td>
                    <td style={styles.td}>Admin</td>
                    <td style={styles.td}>Full system administration and configuration</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>planner</td>
                    <td style={styles.td}>planner</td>
                    <td style={styles.td}>Planner</td>
                    <td style={styles.td}>Production job creation and scheduling</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>store</td>
                    <td style={styles.td}>store</td>
                    <td style={styles.td}>Store</td>
                    <td style={styles.td}>Inventory and material management</td>
                  </tr>
                  <tr>
                    <td style={{...styles.td, fontWeight: 'bold'}}>operator</td>
                    <td style={styles.td}>operator</td>
                    <td style={styles.td}>Operator</td>
                    <td style={styles.td}>Daily production entry and recording</td>
                  </tr>
                </tbody>
              </table>

              <div style={{...styles.recommendationItem, borderLeftColor: '#f39c12', marginTop: '15px'}}>
                <p style={styles.bodyText}>
                  <strong>⚠ Important:</strong> Change all default passwords immediately after first login for security. Use <strong>Settings → User Management → Reset Password</strong>.
                </p>
              </div>
            </div>
          </div>

          {/* SESSION MANAGEMENT */}
          <div id="auth-sessions">
            <div style={styles.card}>
              <h3 style={styles.h3}>7.4 🔄 Session Management</h3>
              <p style={styles.bodyText}>User sessions are managed with the following security features:</p>
              <ul style={styles.discList}>
                <li><strong>Auto-Expiry</strong> – Sessions automatically expire after 1 hours of inactivity by default.</li>
                <li><strong>Manual Logout</strong> – Users can click Logout to end their session immediately.</li>
                <li><strong>Password Reset Revocation</strong> – When an Admin resets a user's password, all active sessions for that user are immediately revoked.</li>
                <li><strong>Account Deactivation</strong> – Deactivating a user account instantly revokes all their active sessions.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* SUPPORT SECTION */}
        <section id="support" style={styles.section}>
          <div style={styles.card}>
            <h3 style={styles.h3}>Support</h3>
            <p style={styles.text}>Email: swayautomationind@gmail.com</p>
            <p style={styles.text}>Phone: +91 63838 02438, 63852 02438</p>
            <p style={styles.text}>Hours: Mon-Sat 10am-7pm</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={styles.footer}>
          <p>© 2025 Manufacturing Production & Inventory Control System · Commercial User Manual · All Rights Reserved</p>
          <p style={styles.footerSmall}>Version 2.0.0 · Built for offline use · SQLite based</p>
        </footer>
      </div>
    </div>
  );
};

const styles = {
  app: {
    display: 'flex',
    height: '100vh',
    fontFamily: "'Segoe UI', Roboto, system-ui, sans-serif",
    background: '#f5f7fa',
    overflow: 'hidden'
  },
  sidebarOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 40,
  },
  sidebarToggle: {
    position: 'fixed',
    left: '20px',
    top: '20px',
    zIndex: 1000,
    background: '#2c3e50',
    color: 'white',
    border: 'none',
    borderRadius: '30px',
    width: '40px',
    height: '40px',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  sidebar: {
    background: '#1e2b38',
    color: 'white',
    height: '100%',
    overflowY: 'auto',
    transition: 'transform 0.25s ease',
    boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
    position: 'relative'
  },
  sidebarHeader: {
    padding: '30px 20px',
    borderBottom: '1px solid #34495e'
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '1.3rem',
    fontWeight: 400,
    letterSpacing: '1px'
  },
  sidebarNav: {
    padding: '20px 0'
  },
  navItem: {
    width: '100%',
    padding: '12px 20px',
    color: '#ecf0f1',
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: 'all 0.2s',
    marginBottom: '4px',
    background: 'transparent'
  },
  sidebarFooter: {
    padding: '20px',
    borderTop: '1px solid #34495e',
    fontSize: '0.8rem',
    color: '#95a5a6'
  },
  mainContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    background: '#f5f7fa'
  },
  topBar: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '20px'
  },
  trialBanner: {
    flex: 1,
    minWidth: '280px',
    background: '#ebb49c',
    border: '1px solid #dee2e6',
    borderRadius: '12px',
    padding: '14px 16px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: '12px'
  },
  trialHeadline: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#2c3e50',
    marginBottom: '8px'
  },
  trialMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    color: '#2c3e50',
    fontSize: '0.95rem',
    fontWeight: 600
  },
  trialMetaLabel: {
    color: '#061c1e',
    fontWeight: 700,
    marginRight: '6px'
  },
  trialMetaMuted: {
    color: '#7f8c8d',
    fontSize: '0.95rem',
    fontWeight: 600
  },
  backButtonContainer: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'flex-start'
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#2c3e50',
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  coverPage: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '60px 40px',
    borderRadius: '20px',
    marginBottom: '30px',
    textAlign: 'center'
  },
  coverTitle: {
    fontSize: '2.5rem',
    marginBottom: '20px',
    fontWeight: 600
  },
  coverSubtitle: {
    fontSize: '1.2rem',
    opacity: 0.9,
    marginBottom: '30px'
  },
  coverBadges: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'center'
  },
  badge: {
    background: 'rgba(255,255,255,0.2)',
    padding: '8px 20px',
    borderRadius: '30px',
    fontSize: '0.9rem'
  },
  section: {
    marginBottom: '40px',
  },
  h2: {
    fontSize: '2rem',
    color: '#2c3e50',
    marginBottom: '25px',
    borderBottom: '3px solid #3498db',
    paddingBottom: '10px'
  },
  h3: {
    fontSize: '1.3rem',
    color: '#34495e',
    marginBottom: '15px'
  },
  h4: {
    fontSize: '1.1rem',
    color: '#2c3e50',
    margin: '15px 0 10px 0'
  },
  card: {
    background: 'white',
    borderRadius: '12px',
    padding: '25px',
    marginBottom: '20px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
  },
  text: {
    color: '#2c3e50',
    lineHeight: 1.6,
    marginBottom: '10px'
  },
  bodyText: {
    color: '#2c3e50',
    lineHeight: 1.5,
    marginBottom: '8px'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '15px'
  },
  th: {
    background: '#34495e',
    color: 'white',
    padding: '12px',
    textAlign: 'left',
    fontWeight: 500
  },
  td: {
    padding: '12px',
    borderBottom: '1px solid #ecf0f1',
    color: '#2c3e50'
  },
  ul: {
    listStyleType: 'none',
    padding: 0
  },
  discList: {
    listStyleType: 'disc',
    paddingLeft: '20px',
    color: '#2c3e50',
    lineHeight: 1.6
  },
  numberedList: {
    listStyleType: 'decimal',
    paddingLeft: '20px',
    color: '#2c3e50',
    lineHeight: 1.6
  },
  checkList: {
    listStyleType: 'none',
    padding: 0
  },
  pre: {
    background: '#2c3e50',
    color: '#ecf0f1',
    padding: '20px',
    borderRadius: '8px',
    overflowX: 'auto',
    fontFamily: 'monospace',
    lineHeight: 1.5
  },
  note: {
    background: '#fff3cd',
    color: '#856404',
    padding: '12px',
    borderRadius: '6px',
    marginTop: '15px'
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  kpiCard: {
    background: '#f8f9fa',
    padding: '15px',
    borderRadius: '8px',
    textAlign: 'center',
    border: '1px solid #dee2e6'
  },
  kpiLabel: {
    display: 'block',
    fontSize: '0.85rem',
    color: '#7f8c8d',
    marginBottom: '5px'
  },
  kpiValue: {
    display: 'block',
    fontSize: '1.8rem',
    fontWeight: 600,
    color: '#2c3e50'
  },
  sectionItem: {
    marginBottom: '20px',
    padding: '15px',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  recommendationItem: {
    marginBottom: '20px',
    padding: '15px',
    background: '#f8f9fa',
    borderRadius: '8px',
    borderLeft: '4px solid #e74c3c'
  },
  stepItem: {
    marginBottom: '15px',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  stepText: {
    marginBottom: '5px'
  },
  fieldGroup: {
    marginBottom: '15px',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  fieldLabel: {
    fontWeight: 'bold',
    marginBottom: '5px',
    color: '#2c3e50'
  },
  fieldText: {
    color: '#2c3e50',
    lineHeight: 1.5
  },
  flowBox: {
    background: '#ecf0f1',
    padding: '15px',
    borderRadius: '8px',
    textAlign: 'center',
    lineHeight: '1.8',
    color: '#2c3e50'
  },
  alertGrid: {
    display: 'grid',
    gap: '10px'
  },
  alert: {
    background: '#f8f9fa',
    padding: '15px',
    borderRadius: '6px',
    border: '1px solid #dee2e6'
  },
  alertHigh: {
    background: '#e74c3c',
    color: 'white',
    padding: '3px 8px',
    borderRadius: '4px',
    marginRight: '10px',
    fontSize: '0.8rem'
  },
  alertMedium: {
    background: '#f39c12',
    color: 'white',
    padding: '3px 8px',
    borderRadius: '4px',
    marginRight: '10px',
    fontSize: '0.8rem'
  },
  alertLow: {
    background: '#3498db',
    color: 'white',
    padding: '3px 8px',
    borderRadius: '4px',
    marginRight: '10px',
    fontSize: '0.8rem'
  },
  flowContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    alignItems: 'center'
  },
  flowItem: {
    background: '#ecf0f1',
    padding: '8px 15px',
    borderRadius: '20px',
    color: '#2c3e50',
    fontSize: '0.9rem'
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px'
  },
  reportItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
    padding: '15px',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  reportContent: {
    flex: 1
  },
  reportTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#2c3e50',
    marginBottom: '5px'
  },
  reportDesc: {
    color: '#7f8c8d',
    fontSize: '0.95rem'
  },
  footer: {
    textAlign: 'center',
    padding: '30px',
    color: '#7f8c8d',
    borderTop: '1px solid #ecf0f1'
  },
  footerSmall: {
    fontSize: '0.8rem',
    marginTop: '5px'
  }
};

export default ProductionManual;
