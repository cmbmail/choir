-- Score detail: introduction, key signature, video summary (on documents)

ALTER TABLE documents
  ADD COLUMN description TEXT NULL AFTER collection_name,
  ADD COLUMN musical_key VARCHAR(32) NULL AFTER description;
