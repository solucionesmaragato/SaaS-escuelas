-- Fix APP_LOGO extension: storage object is Sincoppalogo.jpg (not .PNG).
UPDATE "CLIENTES"
SET "APP_LOGO" = REPLACE("APP_LOGO", 'Sincoppalogo.PNG', 'Sincoppalogo.jpg')
WHERE "APP_LOGO" LIKE '%Sincoppalogo.PNG%';
