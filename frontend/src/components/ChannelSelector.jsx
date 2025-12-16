import React, { useEffect, useState, useMemo } from "react";

export default function ChannelSelector({ initialSelectedChannels = [], onBack, onProceed }) {
  const [channels, setChannels] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  /* ========== IMAGES ========== */
  const programImages = ["/1.jpg", "/2.jpg", "/3.jpg", "/4.jpg", "/5.jpg", "/6.jpg","/7.jpg","/8.jpg",];

  // Fetch channels
  useEffect(() => {
    fetch("https://optwebapp-production-60b4.up.railway.app/channels")
      .then((res) => res.json())
      .then((data) => setChannels(data.channels || []))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, []);

    useEffect(() => {
      if (initialSelectedChannels.length > 0) {
        setSelected(new Set(initialSelectedChannels));
      }
    }, [initialSelectedChannels]);

  // Auto-rotate background images every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % programImages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Filter channels based on search
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) =>
      ch.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [channels, searchTerm]);

  const toggle = (ch) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(ch) ? next.delete(ch) : next.add(ch);
      return next;
    });
  };

  const proceed = () => {
    if (!selected.size) {
      alert("Please select at least one channel.");
      return;
    }
    onProceed(Array.from(selected));
  };

  /* ========== FIXED & UPDATED STYLES ========== */
  const styles = {
    container: {
      display: "grid",
      gridTemplateColumns: "1fr 1.3fr",
      gap: "32px",
      padding: "32px",
      maxWidth: "1600px",
      margin: "0 auto",
      minHeight: "85vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      background: "#e3f0fb",
    },

    /* LEFT: Blue background + image slider */
    leftWrapper: {
      position: "relative",
      borderRadius: "20px",
      overflow: "hidden",
      boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
      background: "linear-gradient(135deg, rgba(49,130,206,0.6), rgba(0,0,0,0.25))", // 🔵 FIX: blue background
    },
    imageSlider: {
      position: "relative",
      height: "100%",
      minHeight: "500px",
    },
    slide: {
      position: "absolute",
      inset: 0,
      opacity: 0,
      transition: "opacity 1.2s ease-in-out",
      backgroundSize: "cover",
      backgroundPosition: "center",
    },
    activeSlide: {
      opacity: 1,
      zIndex: 1,
    },
    overlay: {
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.25)",
      zIndex: 2,
    },

    /* RIGHT SIDE */
    right: {
      background: "#ffffff",
      borderRadius: "20px",
      padding: "36px",
      boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
      display: "flex",
      flexDirection: "column",
    },

    title: {
      fontSize: "30px",
      fontWeight: "800",
      color: "#1a202c",
      textAlign: "center",
      marginBottom: "8px",
    },
    subtitle: {
      color: "#4a5568",
      textAlign: "center",
      fontSize: "16px",
      marginBottom: "20px",
    },

    searchBox: {
      marginBottom: "20px", // 🔧 FIX spacing so cards don't crash
      position: "relative",
    },
    searchInput: {
      width: "100%",
      padding: "14px 48px 14px 44px",
      fontSize: "16px",
      border: "2px solid #e2e8f0",
      borderRadius: "12px",
      outline: "none",
      boxSizing: "border-box", // 🔧 FIXED overflow
    },
    searchIcon: {
      position: "absolute",
      left: "14px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#a0aec0",
      pointerEvents: "none",
    },

    channelList: {
      flex: 1,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      gap: "18px",
      marginTop: "10px",  // 🔧 FIX: prevent overlap
      marginBottom: "24px",
      maxHeight: "500px",
      overflowY: "auto",
      paddingRight: "8px",
      paddingTop: "10px", // 🔧 extra top padding
    },

    card: (isSelected) => ({
      background: isSelected ? "#ebf8ff" : "#ffffff",
      border: `2px solid ${isSelected ? "#3182ce" : "#e2e8f0"}`,
      borderRadius: "14px",
      padding: "16px",
      cursor: "pointer",
      transition: "all 0.25s ease",
      boxShadow: isSelected
        ? "0 8px 20px rgba(49,130,206,0.2)"
        : "0 2px 8px rgba(0,0,0,0.06)",
      transform: isSelected ? "translateY(-2px)" : "translateY(0)",
    }),

    logoWrapper: {
      height: "56px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "12px",
    },
    logo: {
      maxHeight: "56px",
      maxWidth: "100%",
      objectFit: "contain",
    },

    channelName: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#2d3748",
      textAlign: "center",
      marginTop: "8px",
    },

    // Buttons
    buttons: {
      display: "flex",
      justifyContent: "center",
      gap: "16px",
      marginTop: "auto",
      paddingTop: "20px",
    },
    backBtn: {
      padding: "14px 28px",
      background: "#f7fafc",
      color: "#4a5568",
      border: "2px solid #e2e8f0",
      borderRadius: "12px",
      fontWeight: "600",
      fontSize: "16px",
      cursor: "pointer",
    },
    nextBtn: {
      padding: "14px 32px",
      background: selected.size > 0 ? "#3182ce" : "#a0aec0",
      color: "white",
      border: "none",
      borderRadius: "12px",
      fontWeight: "700",
      fontSize: "16px",
      cursor: selected.size > 0 ? "pointer" : "not-allowed",
      transition: "all 0.3s",
    },
  };

  return (
    <div style={styles.container}>
      {/* LEFT: Dynamic Image Slider (TEXT REMOVED) */}
      <div style={styles.leftWrapper}>
        <div style={styles.imageSlider}>
          {programImages.map((img, idx) => (
            <div
              key={idx}
              style={{
                ...styles.slide,
                backgroundImage: `url('${img}')`,
                ...(idx === currentImageIndex ? styles.activeSlide : {}),
              }}
            >
              <div style={styles.overlay}></div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Channel Selection */}
      <div style={styles.right}>
        <h2 style={styles.title}>Select Your Channels</h2>
        <p style={styles.subtitle}>Pick at least one to continue. ({selected.size} selected)</p>

        {/* Search */}
        <div style={styles.searchBox}>
          <svg style={styles.searchIcon} width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" />
          </svg>

          <input
            type="text"
            placeholder="Search channels..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Channel Grid */}
        <div style={styles.channelList}>
          {loading ? (
            <>
              <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#718096" }}>
                Loading channels…
              </p>
              {Array(6)
                .fill()
                .map((_, i) => (
                  <div key={i} style={{ ...styles.card(false), height: "120px", opacity: 0.4 }}></div>
                ))}
            </>
          ) : filteredChannels.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#718096" }}>
              No channels found.
            </p>
          ) : (
            filteredChannels.map((ch) => {
              const isSelected = selected.has(ch);

              return (
                <div
                  key={ch}
                  onClick={() => toggle(ch)}
                  style={styles.card(isSelected)}
                >
                  <div style={styles.logoWrapper}>
                    <img
                      src={`/logos/${ch}.png`}
                      alt={ch}
                      style={styles.logo}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          ch
                        )}&background=3182ce&color=fff&size=128`;
                      }}
                    />
                  </div>
                  <div style={styles.channelName}>{ch}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Buttons */}
        <div style={styles.buttons}>
          <button onClick={onBack} style={styles.backBtn}>Back</button>
          <button onClick={proceed} style={styles.nextBtn} disabled={!selected.size}>
            Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
