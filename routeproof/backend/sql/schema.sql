-- RouteProof v2.0 Schema (MySQL 8 / MariaDB 10.5+). Run via: npm run db:init
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS otp_codes, audit_log, photos, visits, driver_vehicle_log, assignments, stops, campaigns, vehicles, users;
SET FOREIGN_KEY_CHECKS=1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  mobile VARCHAR(20) NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','subadmin','driver') NOT NULL,
  permissions TEXT NULL,
  language ENUM('en','mr') NOT NULL DEFAULT 'en',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE otp_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_mobile (mobile, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(30) NOT NULL UNIQUE,
  type VARCHAR(40) NULL,
  owner VARCHAR(120) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser VARCHAR(150) NOT NULL,
  name VARCHAR(150) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('active','paused','closed') NOT NULL DEFAULT 'active',
  photo_interval_min INT NOT NULL DEFAULT 10,
  min_stay_min INT NOT NULL DEFAULT 5,
  notes TEXT NULL,
  route_version INT NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_campaign_status (status),
  INDEX idx_campaign_dates (start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE stops (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  seq INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  radius_m INT NOT NULL DEFAULT 200,
  min_stay_min INT NULL,
  instructions VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  INDEX idx_stops_campaign (campaign_id, seq)
) ENGINE=InnoDB;

CREATE TABLE assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id INT NOT NULL,
  driver_id INT NOT NULL,
  work_date DATE NOT NULL,
  stop_ids TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assign (campaign_id, driver_id, work_date),
  INDEX idx_assign_date (work_date, is_active),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Permanent append-only history: which driver had which vehicle (and campaign) on which day
CREATE TABLE driver_vehicle_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  work_date DATE NOT NULL,
  driver_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  campaign_id INT NULL,
  selected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_date (work_date),
  INDEX idx_log_driver (driver_id, work_date),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stop_id INT NOT NULL,
  stop_name_snap VARCHAR(150) NOT NULL,
  stop_addr_snap VARCHAR(255) NULL,
  campaign_id INT NOT NULL,
  driver_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  work_date DATE NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  status ENUM('arrived','completed','approved','rejected') NOT NULL DEFAULT 'arrived',
  arrived_at DATETIME NOT NULL,
  departed_at DATETIME NULL,
  min_stay_met TINYINT(1) NULL,
  flag_reason VARCHAR(255) NULL,
  review_reason VARCHAR(255) NULL,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  UNIQUE KEY uq_visit (stop_id, driver_id, work_date, attempt),
  INDEX idx_visit_date (work_date),
  INDEX idx_visit_status (status),
  FOREIGN KEY (stop_id) REFERENCES stops(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB;

CREATE TABLE photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visit_id INT NOT NULL,
  type ENUM('arrival','interval','departure') NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  file_hash CHAR(64) NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m DECIMAL(8,2) NULL,
  address VARCHAR(255) NULL,
  distance_m INT NULL,
  within_radius TINYINT(1) NULL,
  is_flagged TINYINT(1) NOT NULL DEFAULT 0,
  flag_notes VARCHAR(255) NULL,
  captured_offline TINYINT(1) NOT NULL DEFAULT 0,
  taken_at DATETIME NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE,
  INDEX idx_photo_visit (visit_id, taken_at),
  INDEX idx_photo_hash (file_hash)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  details TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;
