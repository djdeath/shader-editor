const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;

let getKeyboard = function() {
    let deviceManager = Gdk.Display.get_default().get_device_manager();
    let devices = deviceManager.list_devices(Gdk.DeviceType.MASTER);
    let keyboard = null;
    for (let i in devices) {
        if (devices[i].get_source() == Gdk.InputSource.KEYBOARD) {
            return devices[i];
        }
    }
    return null;
};

let getMouse = function() {
    let deviceManager = Gdk.Display.get_default().get_device_manager();
    let devices = deviceManager.list_devices(Gdk.DeviceType.MASTER);
    let keyboard = null;
    for (let i in devices) {
        if (devices[i].get_source() == Gdk.InputSource.MOUSE) {
            return devices[i];
        }
    }
    return null;
};

/**/

// Gtk.init(null, null);

// let keyboard = getKeyboard();
// log(keyboard.get_name());

// let mouse = getMouse();
// log(mouse.get_name());
