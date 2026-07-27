-- BYBLOS - Flight Booking System (IVAO), MySQL schema
-- Charset/engine chosen for broad MySQL 8 / MariaDB compatibility.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vid           VARCHAR(16)  NOT NULL,
  firstName     VARCHAR(120) NOT NULL DEFAULT '',
  lastName      VARCHAR(120) NOT NULL DEFAULT '',
  atcRating     INT          NOT NULL DEFAULT 0,
  pilotRating   INT          NOT NULL DEFAULT 0,
  email         VARCHAR(255) NULL,
  division      VARCHAR(8)   NOT NULL DEFAULT '',
  country       VARCHAR(8)   NOT NULL DEFAULT '',
  isAdmin       TINYINT(1)   NOT NULL DEFAULT 0,
  suspended     TINYINT(1)   NOT NULL DEFAULT 0,
  createdAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_vid (vid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Staff-managed catalogue of event types. `opsSlots` marks RFO-style events that
-- use directional (departure/arrival) and private slot handling.
CREATE TABLE IF NOT EXISTS event_types (
  code        VARCHAR(16)  NOT NULL PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  opsSlots    TINYINT(1)   NOT NULL DEFAULT 0,
  sortOrder   INT          NOT NULL DEFAULT 0,
  createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Default IVAO event types (https://wiki.ivao.aero/en/home/events/typeofevents).
-- Reference data, always present; staff can add/edit/remove these afterwards.
INSERT IGNORE INTO event_types (code, name, description, opsSlots, sortOrder) VALUES
  ('rfe','Real Flight Event','Follows the real-world schedule for one or more airports.',0,10),
  ('rfo','Real Flight Operations','Real ops with slots per hour; allows private slots and VA partnerships.',1,20),
  ('mse','Mega Slot Event','RFO subtype: empty slots that pilots fill with their own flight details.',1,30),
  ('pde','Public Demonstration Event','Live, in-situ event presenting the network to the public.',0,40),
  ('airbridge','Airbridge','Connects two or more airports; uni-, bi- or multidirectional.',0,50),
  ('flyinout','Fly-In / Fly-Out','Pilots fly in or out of the chosen airports freely.',0,60),
  ('longhaul','Long Haul','Long-duration flights of more than six hours.',0,70),
  ('vintage','Vintage','Classic aircraft and old navigation procedures.',0,80),
  ('historical','Historical','Tied to significant historical aviation dates.',0,90);

CREATE TABLE IF NOT EXISTS events (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  division              VARCHAR(8)   NOT NULL DEFAULT '',
  eventName             VARCHAR(255) NOT NULL,
  description           TEXT         NOT NULL,
  type                  VARCHAR(16)  NOT NULL DEFAULT 'rfe',
  status                ENUM('created','scheduled','finished','cancelled') NOT NULL DEFAULT 'created',
  dateStart             DATETIME     NOT NULL,
  dateEnd               DATETIME     NOT NULL,
  banner                VARCHAR(1024) NOT NULL DEFAULT '',
  atcBooking            VARCHAR(1024) NOT NULL DEFAULT '',
  atcBriefing           VARCHAR(1024) NULL,
  pilotBriefing         VARCHAR(1024) NULL,
  publicAccess          TINYINT(1)   NOT NULL DEFAULT 1,
  allowBookingAfterStart TINYINT(1)  NOT NULL DEFAULT 0,
  maxBookingsPerPilot   INT          NOT NULL DEFAULT 0,
  bookingMessage        VARCHAR(2000) NULL,
  useIvaoRoutes         TINYINT(1)   NOT NULL DEFAULT 0,
  -- When 1, a booking is provisional (prebooked) and the pilot must confirm it.
  -- When 0, a booking is instant (auto-booked straight to 'booked').
  requireConfirmation   TINYINT(1)   NOT NULL DEFAULT 1,
  -- Hours before dateStart at which confirmation becomes allowed (the confirm window
  -- opens). Admin-tunable; default 168h (7 days). Only used when requireConfirmation=1.
  confirmOpensHoursBefore INT        NOT NULL DEFAULT 168,
  -- Hours before dateStart after which a still-unconfirmed prebooked slot becomes
  -- CLAIMABLE by other pilots (it is NOT freed; the holder keeps it until someone
  -- else claims it, and can still confirm to secure it). 0 = never claimable.
  confirmDeadlineHours  INT          NOT NULL DEFAULT 0,
  -- Auto confirm-reminder scheduling: send this many hours before start (0 = off),
  -- or at an explicit UTC time (confirmReminderAt, which takes precedence when set).
  confirmReminderHoursBefore INT     NOT NULL DEFAULT 0,
  confirmReminderAt     DATETIME     NULL,
  createdBy             BIGINT UNSIGNED NULL,
  createdAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_events_dateEnd (dateEnd),
  KEY idx_events_status (status),
  KEY idx_events_type (type),
  CONSTRAINT fk_events_creator FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  -- Prevents deleting a type that events still reference (ON DELETE RESTRICT).
  CONSTRAINT fk_events_type FOREIGN KEY (type) REFERENCES event_types(code) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_airports (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eventId   BIGINT UNSIGNED NOT NULL,
  icao      VARCHAR(4) NOT NULL,
  UNIQUE KEY uq_event_airport (eventId, icao),
  CONSTRAINT fk_ea_event FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Staff-managed list of flight simulators (used when adding sceneries).
CREATE TABLE IF NOT EXISTS simulators (
  code       VARCHAR(16) NOT NULL PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  sortOrder  INT NOT NULL DEFAULT 0,
  createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO simulators (code, name, sortOrder) VALUES
  ('msfs2024','Microsoft Flight Simulator 2024',10),
  ('msfs','Microsoft Flight Simulator 2020',20),
  ('xp12','X-Plane 12',30),
  ('xp11','X-Plane 11',40),
  ('p3d','Prepar3D',50),
  ('fsx','Flight Simulator X',60),
  ('fs9','Flight Simulator 2004',70);

CREATE TABLE IF NOT EXISTS sceneries (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  icao       VARCHAR(4)  NOT NULL,
  title      VARCHAR(255) NOT NULL,
  license    ENUM('freeware','payware') NOT NULL DEFAULT 'freeware',
  link       VARCHAR(1024) NOT NULL,
  simulator  VARCHAR(16) NOT NULL DEFAULT 'msfs',
  createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sceneries_icao (icao),
  KEY idx_sceneries_sim (simulator),
  CONSTRAINT fk_sceneries_sim FOREIGN KEY (simulator) REFERENCES simulators(code) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS slots (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eventId             BIGINT UNSIGNED NOT NULL,
  pilotId             BIGINT UNSIGNED NULL,
  flightNumber        VARCHAR(10) NULL,
  isFixedFlightNumber TINYINT(1) NOT NULL DEFAULT 0,
  origin              VARCHAR(4) NULL,
  isFixedOrigin       TINYINT(1) NOT NULL DEFAULT 0,
  destination         VARCHAR(4) NULL,
  isFixedDestination  TINYINT(1) NOT NULL DEFAULT 0,
  slotTime            DATETIME NULL,
  isFixedSlotTime     TINYINT(1) NOT NULL DEFAULT 0,
  gate                VARCHAR(10) NULL,
  aircraft            VARCHAR(4) NULL,
  isFixedAircraft     TINYINT(1) NOT NULL DEFAULT 0,
  isPrivate           TINYINT(1) NOT NULL DEFAULT 0,
  route               TEXT NULL,
  bookingStatus       ENUM('free','prebooked','booked') NOT NULL DEFAULT 'free',
  bookingTime         DATETIME NULL,
  createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_slots_event (eventId),
  KEY idx_slots_pilot (pilotId),
  KEY idx_slots_status (bookingStatus),
  KEY idx_slots_time (slotTime),
  CONSTRAINT fk_slots_event FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_slots_pilot FOREIGN KEY (pilotId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Simple activity log for auditability (an improvement over the original).
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId    BIGINT UNSIGNED NULL,
  action    VARCHAR(64) NOT NULL,
  entity    VARCHAR(64) NOT NULL,
  entityId  VARCHAR(64) NULL,
  meta      JSON NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entityId),
  KEY idx_audit_user (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks emails sent per event. reminder + report are one-time (enforced in the
-- route by checking for an existing row of that type); notam is unlimited.
CREATE TABLE IF NOT EXISTS event_emails (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  eventId     BIGINT UNSIGNED NOT NULL,
  type        ENUM('reminder','report','notam','confirm-reminder','cancelled') NOT NULL,
  -- 'once' for reminder/report (so the UNIQUE key blocks a second send), a unique
  -- token per notam (so NOTAMs are unlimited).
  onceKey     VARCHAR(40) NOT NULL DEFAULT 'once',
  subject     VARCHAR(255) NOT NULL DEFAULT '',
  sentBy      BIGINT UNSIGNED NULL,
  recipients  INT NOT NULL DEFAULT 0,
  sent        INT NOT NULL DEFAULT 0,
  failed      INT NOT NULL DEFAULT 0,
  createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_emails_once (eventId, type, onceKey),
  CONSTRAINT fk_event_emails_event FOREIGN KEY (eventId) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-recipient delivery result for each sent email (who it went to + ok/failed).
CREATE TABLE IF NOT EXISTS event_email_recipients (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  emailId   BIGINT UNSIGNED NOT NULL,
  vid       VARCHAR(16) NOT NULL DEFAULT '',
  name      VARCHAR(160) NOT NULL DEFAULT '',
  email     VARCHAR(255) NOT NULL DEFAULT '',
  ok        TINYINT(1) NOT NULL DEFAULT 0,
  error     VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_eer_email (emailId),
  CONSTRAINT fk_eer_email FOREIGN KEY (emailId) REFERENCES event_emails(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Staff-defined custom airports. These supplement the IVAO catalogue and, when an
-- ICAO matches, OVERRIDE it in the typeaheads and flight map (e.g. an event-only or
-- fictional field). Coordinates feed the route map; weather still comes from IVAO.
CREATE TABLE IF NOT EXISTS custom_airports (
  icao       CHAR(4) NOT NULL PRIMARY KEY,
  iata       VARCHAR(4) NULL,
  name       VARCHAR(120) NOT NULL,
  city       VARCHAR(120) NULL,
  countryId  VARCHAR(2) NULL,
  latitude   DOUBLE NULL,
  longitude  DOUBLE NULL,
  elevation  INT NULL,
  createdBy  BIGINT UNSIGNED NULL,
  createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Staff-defined custom aircraft types (supplement/override the IVAO catalogue).
CREATE TABLE IF NOT EXISTS custom_aircraft (
  icao         VARCHAR(4) NOT NULL PRIMARY KEY,
  iata         VARCHAR(4) NULL,
  model        VARCHAR(120) NOT NULL,
  manufacturer VARCHAR(120) NULL,
  wtc          CHAR(1) NULL,
  createdBy    BIGINT UNSIGNED NULL,
  createdAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
