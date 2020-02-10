CREATE TABLE IF NOT EXISTS users(
    id CHAR(36),
    name VARCHAR(255),
    password VARCHAR(255),
    lastLogin DATE,
    created DATE
);