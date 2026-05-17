ALTER TABLE CaptchaSolutions DROP FOREIGN KEY IF EXISTS CaptchaSolutions_ibfk_1;
ALTER TABLE ChallengeSolutions DROP FOREIGN KEY IF EXISTS ChallengeSolutions_ibfk_1;
ALTER TABLE CaptchaSolutions DROP INDEX IF EXISTS ip;
ALTER TABLE ChallengeSolutions DROP INDEX IF EXISTS ip;
