// Watches UPower's OnBattery so the breeze can rest while unplugged.

import Gio from 'gi://Gio';

export class BatteryMonitor {
    /** @param {() => void} onChange called whenever `onBattery` may have changed */
    constructor(onChange) {
        this.onBattery = false; // No UPower (desktops, VMs): assume mains power.
        this._onChange = onChange;
        this._proxy = null;
        this._cancellable = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            'org.freedesktop.UPower',
            this._cancellable,
            (_source, result) => this._onProxy(result));
    }

    _onProxy(result) {
        let proxy;
        try {
            proxy = Gio.DBusProxy.new_for_bus_finish(result);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.debug(`Dangle: UPower unavailable, assuming mains power: ${e.message}`);
            return;
        }
        if (this._cancellable.is_cancelled())
            return;
        this._proxy = proxy;
        proxy.connectObject('g-properties-changed', () => this._sync(), this);
        this._sync();
    }

    _sync() {
        const value = this._proxy?.get_cached_property('OnBattery');
        const onBattery = value ? value.unpack() : false;
        if (onBattery === this.onBattery)
            return;
        this.onBattery = onBattery;
        this._onChange?.();
    }

    destroy() {
        this._cancellable.cancel();
        this._proxy?.disconnectObject(this);
        this._proxy = null;
        this._onChange = null;
    }
}
