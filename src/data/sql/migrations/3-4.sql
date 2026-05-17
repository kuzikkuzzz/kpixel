ALTER TABLE CaptchaSolutions DROP FOREIGN KEY CaptchaSolutions_ibfk_1;
ALTER TABLE ChallengeSolutions DROP FOREIGN KEY ChallengeSolutions_ibfk_1;
ALTER TABLE CaptchaSolutions DROP INDEX ip;
ALTER TABLE ChallengeSolutions DROP INDEX ip;
