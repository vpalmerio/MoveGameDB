// THIS FILE IS AUTOMATICALLY GENERATED BY SPACETIMEDB. EDITS TO THIS FILE
// WILL NOT BE SAVED. MODIFY TABLES IN YOUR MODULE SOURCE CODE INSTEAD.

#![allow(unused, clippy::all)]
use super::circle_decay_timer_type::CircleDecayTimer;
use spacetimedb_sdk::__codegen::{self as __sdk, __lib, __sats, __ws};

/// Table handle for the table `circle_decay_timer`.
///
/// Obtain a handle from the [`CircleDecayTimerTableAccess::circle_decay_timer`] method on [`super::RemoteTables`],
/// like `ctx.db.circle_decay_timer()`.
///
/// Users are encouraged not to explicitly reference this type,
/// but to directly chain method calls,
/// like `ctx.db.circle_decay_timer().on_insert(...)`.
pub struct CircleDecayTimerTableHandle<'ctx> {
    imp: __sdk::TableHandle<CircleDecayTimer>,
    ctx: std::marker::PhantomData<&'ctx super::RemoteTables>,
}

#[allow(non_camel_case_types)]
/// Extension trait for access to the table `circle_decay_timer`.
///
/// Implemented for [`super::RemoteTables`].
pub trait CircleDecayTimerTableAccess {
    #[allow(non_snake_case)]
    /// Obtain a [`CircleDecayTimerTableHandle`], which mediates access to the table `circle_decay_timer`.
    fn circle_decay_timer(&self) -> CircleDecayTimerTableHandle<'_>;
}

impl CircleDecayTimerTableAccess for super::RemoteTables {
    fn circle_decay_timer(&self) -> CircleDecayTimerTableHandle<'_> {
        CircleDecayTimerTableHandle {
            imp: self.imp.get_table::<CircleDecayTimer>("circle_decay_timer"),
            ctx: std::marker::PhantomData,
        }
    }
}

pub struct CircleDecayTimerInsertCallbackId(__sdk::CallbackId);
pub struct CircleDecayTimerDeleteCallbackId(__sdk::CallbackId);

impl<'ctx> __sdk::Table for CircleDecayTimerTableHandle<'ctx> {
    type Row = CircleDecayTimer;
    type EventContext = super::EventContext;

    fn count(&self) -> u64 {
        self.imp.count()
    }
    fn iter(&self) -> impl Iterator<Item = CircleDecayTimer> + '_ {
        self.imp.iter()
    }

    type InsertCallbackId = CircleDecayTimerInsertCallbackId;

    fn on_insert(
        &self,
        callback: impl FnMut(&Self::EventContext, &Self::Row) + Send + 'static,
    ) -> CircleDecayTimerInsertCallbackId {
        CircleDecayTimerInsertCallbackId(self.imp.on_insert(Box::new(callback)))
    }

    fn remove_on_insert(&self, callback: CircleDecayTimerInsertCallbackId) {
        self.imp.remove_on_insert(callback.0)
    }

    type DeleteCallbackId = CircleDecayTimerDeleteCallbackId;

    fn on_delete(
        &self,
        callback: impl FnMut(&Self::EventContext, &Self::Row) + Send + 'static,
    ) -> CircleDecayTimerDeleteCallbackId {
        CircleDecayTimerDeleteCallbackId(self.imp.on_delete(Box::new(callback)))
    }

    fn remove_on_delete(&self, callback: CircleDecayTimerDeleteCallbackId) {
        self.imp.remove_on_delete(callback.0)
    }
}

#[doc(hidden)]
pub(super) fn register_table(client_cache: &mut __sdk::ClientCache<super::RemoteModule>) {
    let _table = client_cache.get_or_make_table::<CircleDecayTimer>("circle_decay_timer");
    _table.add_unique_constraint::<u64>("scheduled_id", |row| &row.scheduled_id);
}
pub struct CircleDecayTimerUpdateCallbackId(__sdk::CallbackId);

impl<'ctx> __sdk::TableWithPrimaryKey for CircleDecayTimerTableHandle<'ctx> {
    type UpdateCallbackId = CircleDecayTimerUpdateCallbackId;

    fn on_update(
        &self,
        callback: impl FnMut(&Self::EventContext, &Self::Row, &Self::Row) + Send + 'static,
    ) -> CircleDecayTimerUpdateCallbackId {
        CircleDecayTimerUpdateCallbackId(self.imp.on_update(Box::new(callback)))
    }

    fn remove_on_update(&self, callback: CircleDecayTimerUpdateCallbackId) {
        self.imp.remove_on_update(callback.0)
    }
}

#[doc(hidden)]
pub(super) fn parse_table_update(
    raw_updates: __ws::TableUpdate<__ws::BsatnFormat>,
) -> __sdk::Result<__sdk::TableUpdate<CircleDecayTimer>> {
    __sdk::TableUpdate::parse_table_update(raw_updates).map_err(|e| {
        __sdk::InternalError::failed_parse("TableUpdate<CircleDecayTimer>", "TableUpdate")
            .with_cause(e)
            .into()
    })
}

/// Access to the `scheduled_id` unique index on the table `circle_decay_timer`,
/// which allows point queries on the field of the same name
/// via the [`CircleDecayTimerScheduledIdUnique::find`] method.
///
/// Users are encouraged not to explicitly reference this type,
/// but to directly chain method calls,
/// like `ctx.db.circle_decay_timer().scheduled_id().find(...)`.
pub struct CircleDecayTimerScheduledIdUnique<'ctx> {
    imp: __sdk::UniqueConstraintHandle<CircleDecayTimer, u64>,
    phantom: std::marker::PhantomData<&'ctx super::RemoteTables>,
}

impl<'ctx> CircleDecayTimerTableHandle<'ctx> {
    /// Get a handle on the `scheduled_id` unique index on the table `circle_decay_timer`.
    pub fn scheduled_id(&self) -> CircleDecayTimerScheduledIdUnique<'ctx> {
        CircleDecayTimerScheduledIdUnique {
            imp: self.imp.get_unique_constraint::<u64>("scheduled_id"),
            phantom: std::marker::PhantomData,
        }
    }
}

impl<'ctx> CircleDecayTimerScheduledIdUnique<'ctx> {
    /// Find the subscribed row whose `scheduled_id` column value is equal to `col_val`,
    /// if such a row is present in the client cache.
    pub fn find(&self, col_val: &u64) -> Option<CircleDecayTimer> {
        self.imp.find(col_val)
    }
}
