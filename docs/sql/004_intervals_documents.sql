-- Generic mirrored documents (athlete profile, sport settings) for zero-network serving
CREATE TABLE IF NOT EXISTS intervals_documents (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    doc_key VARCHAR(32) NOT NULL,
    payload_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_intl_doc (user_id, doc_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
