-- TrackingCF Database Schema
-- MySQL 8.0+

CREATE DATABASE IF NOT EXISTS tracking_cf CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tracking_cf;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    handle VARCHAR(100) NOT NULL UNIQUE,
    avatar_url VARCHAR(500) NULL,
    rating INT NULL,
    `rank` VARCHAR(50) NULL,
    last_submission_time TIMESTAMP NULL,
    current_streak INT DEFAULT 0,
    last_streak_date VARCHAR(10) NULL COMMENT 'YYYY-MM-DD format in local timezone',
    enabled BOOLEAN DEFAULT TRUE,
    is_hidden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_handle (handle),
    INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de submissions
CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contest_id INT NOT NULL,
    problem_index VARCHAR(10) NOT NULL,
    problem_name VARCHAR(255) NOT NULL,
    rating INT NULL,
    tags JSON NULL,
    submission_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_submission (user_id, contest_id, problem_index),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, submission_time DESC),
    INDEX idx_user_rating (user_id, rating),
    INDEX idx_submission_time (submission_time DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de estadísticas (caché)
CREATE TABLE IF NOT EXISTS user_stats (
    user_id INT PRIMARY KEY,
    total_score INT DEFAULT 0,
    count_no_rating INT DEFAULT 0,
    count_800_900 INT DEFAULT 0,
    count_1000 INT DEFAULT 0,
    count_1100 INT DEFAULT 0,
    count_1200_plus INT DEFAULT 0,
    last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de contests
CREATE TABLE IF NOT EXISTS contests (
    id VARCHAR(50) PRIMARY KEY, -- CF Contest ID or LC Slug
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    phase VARCHAR(50),
    frozen BOOLEAN,
    durationSeconds INT,
    startTimeSeconds INT,
    relativeTimeSeconds INT,
    platform VARCHAR(50) DEFAULT 'CODEFORCES',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de metadata del sistema (configuración global persistente)
CREATE TABLE IF NOT EXISTS system_metadata (
    key_name VARCHAR(50) PRIMARY KEY,
    value VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de administradores
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Tabla de logs de auditoría
-- Tabla de logs de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NULL, -- ID del administrador que realizó la acción
    action VARCHAR(50) NOT NULL, -- LOGIN, CREATE_USER, DELETE_USER, ETC
    details JSON NULL, -- Detalles adicionales (handle afectado, cambios, etc)
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(500),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de notificaciones
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL, -- CONTEST, RANK_UP, SYSTEM
    message TEXT NOT NULL,
    related_id VARCHAR(100) NULL, -- ContestID, Handle, etc.
    link VARCHAR(500) NULL, -- URL to redirect ONLY if type is custom or needs redirection
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL,
    INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Tabla de mensajes de chat
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    user_handle VARCHAR(100) NOT NULL,
    role ENUM('user', 'model') NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_handle (user_handle),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
