# WaterMe! Project Roadmap & TODO

## v1.x.x (MVP)
- [x] Garden creation UI (name, location, mode)
- [x] Geocoding with OpenCage
- [x] Timezone selection and current time display
- [ ] Backend integration for garden config

## v2.x.x
- [ ] Garden dashboard/overview page
- [ ] Plant/zone management
- [ ] Watering schedule setup (now database-backed)
- [ ] Basic analytics (watering history, etc.)

## Database-backed Scheduling
- [ ] Update frontend handleContinue to POST schedule data to /api/schedule endpoint
- [ ] Test saving and retrieving schedule data from the new SQLite database
- [ ] Document manual steps for database migration or inspection (e.g., using DB Browser for SQLite)
- [ ] Backend: Fix linter error for NoneType in schedule saving logic

## v3.x.x
- [ ] User authentication (optional)
- [ ] Multi-garden support
- [ ] Advanced analytics and reporting
- [ ] Mobile-friendly UI improvements

## v4.x.x (Hardware Integration)
- [ ] Raspberry Pi hardware integration
  - [ ] Set system clock from UI
  - [ ] Connect to Wi-Fi from UI
  - [ ] Setup Wi-Fi/ad-hoc hotspot for remote admin (no Wi-Fi available)
  - [ ] System administration panel for device/network management
- [ ] OTA (over-the-air) updates for firmware/software

## v5.x.x (Smart Features)
- [ ] Smart watering mode (weather, soil sensors, etc.)
- [ ] Integration with weather APIs
- [ ] Notifications (email/SMS/push)

## Future Ideas
- [ ] Voice assistant integration (Google/Alexa)
- [ ] Community/shared garden templates
- [ ] Marketplace for plant/zone configs
- [ ] API for third-party integrations

---
*Update this file as features are added, planned, or completed!* 